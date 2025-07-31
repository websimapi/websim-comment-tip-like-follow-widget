import { marked } from 'marked';
import DOMPurify from 'dompurify';

// --- DOM Elements ---
const ctlIcon = document.getElementById('ctl-icon');
const ctlHeart = document.getElementById('ctl-heart');
const ctlTipAmount = document.getElementById('ctl-tip-amount');
const ctlFollowIcon = document.getElementById('ctl-follow-icon');

let project = null;
let currentUser = null;

/**
 * Checks if the current user has liked the project.
 * @param {string} userId
 * @param {string} projectId
 * @returns {Promise<boolean>}
 */
async function hasUserLikedProject(userId, projectId) {
    try {
        const response = await fetch(`/api/v1/users/${userId}/project/${projectId}/like`);
        if (!response.ok) {
            console.error("Failed to fetch project like status");
            return false;
        }
        const data = await response.json();
        return data.like !== null;
    } catch (error) {
        console.error("Error checking project like status:", error);
        return false;
    }
}

/**
 * Checks if the current user is following the project creator.
 * @param {string} currentUserId 
 * @param {string} creatorId 
 * @returns {Promise<boolean>}
 */
async function isFollowingCreator(currentUserId, creatorId) {
    try {
        const response = await fetch(`/api/v1/users/${currentUserId}/following`);
        if (!response.ok) {
            console.error("Failed to fetch following list");
            return false;
        }
        const data = await response.json();
        if (data.following && data.following.data) {
            // NOTE: This assumes the following list isn't huge. For production, you'd handle pagination.
            return data.following.data.some(item => item.follow.user.id === creatorId);
        }
        return false;
    } catch (error) {
        console.error("Error checking following status:", error);
        return false;
    }
}

// --- API & Data Handling ---

/**
 * Fetches all comments for the current project, handling pagination.
 * @returns {Array} A list of all comment objects.
 */
async function fetchAllComments(projectId) {
    let allComments = [];
    let cursor = null;
    let hasNextPage = true;

    while (hasNextPage) {
        const params = new URLSearchParams();
        if (cursor) {
            params.append('after', cursor);
        }
        const response = await fetch(`/api/v1/projects/${projectId}/comments?${params.toString()}`);
        if (!response.ok) {
            console.error("Failed to fetch comments");
            break;
        }
        const data = await response.json();
        const commentsData = data.comments;
        
        if (commentsData && commentsData.data) {
            allComments.push(...commentsData.data.map(c => c.comment));
            hasNextPage = commentsData.has_next_page;
            // The cursor is on the last item of the `data` array in the response
            if(hasNextPage && commentsData.data.length > 0) {
              cursor = commentsData.data[commentsData.data.length - 1].cursor;
            } else {
              cursor = null;
            }
        } else {
            hasNextPage = false;
        }
    }
    return allComments;
}

/**
 * Processes comments to calculate user-specific tip data.
 * @param {Array} comments - The list of comments.
 * @param {string} userId - The ID of the current user.
 * @returns {number} The total credits tipped by the user.
 */
function processUserTips(comments, userId) {
    let totalTips = 0;

    for (const comment of comments) {
        // Check for tips from the current user
        if (comment.author.id === userId && comment.card_data?.type === 'tip_comment') {
            totalTips += comment.card_data.credits_spent;
        }
    }

    return totalTips;
}

/**
 * Updates the floating icon's appearance based on user data.
 * @param {number} totalTips - Total credits tipped by the user.
 * @param {boolean} hasReacted - True if the user has liked/reacted to any comment.
 * @param {boolean} isFollowing - True if the user is following the creator.
 */
function updateFloatingIcon(totalTips, hasReacted, isFollowing) {
    if (hasReacted) {
        ctlHeart.style.display = 'block';
    } else {
        ctlHeart.style.display = 'none';
    }

    if (totalTips > 0) {
        ctlTipAmount.textContent = `${totalTips}♦`;
        ctlTipAmount.style.display = 'block';
    } else {
        ctlTipAmount.style.display = 'none';
    }

    if (isFollowing) {
        ctlFollowIcon.style.display = 'block';
    } else {
        ctlFollowIcon.style.display = 'none';
    }
}

// --- Event Handlers ---

async function handleIconClick() {
    // Open the native comment composition UI
    const result = await window.websim.postComment({ content: '' });
    if (result && result.error) {
        // This error can happen if the user closes the comment window without posting
        console.log('Post comment action cancelled or failed:', result.error);
    }
}

function handleRealtimeComment(data) {
    console.log('New comment received:', data);
    // When a new comment is created (even by the current user), refetch all data
    // to update the icon state (e.g., if it was a tip comment).
    initializeApp();
}

// --- Initialization ---

async function initializeApp() {
    try {
        project = await window.websim.getCurrentProject();
        currentUser = await window.websim.getCurrentUser();
        const creator = await window.websim.getCreator();

        if (!project || !currentUser || !creator) {
            console.error('Could not load project, user, or creator data.');
            return;
        }

        const isOwner = currentUser.id === creator.id;
        
        const [allComments, hasLiked, isFollowing] = await Promise.all([
            fetchAllComments(project.id),
            hasUserLikedProject(currentUser.id, project.id),
            isOwner ? Promise.resolve(true) : isFollowingCreator(currentUser.id, creator.id)
        ]);
        
        const totalTips = processUserTips(allComments, currentUser.id);
        updateFloatingIcon(totalTips, hasLiked, isFollowing);

    } catch (error) {
        console.error("Initialization failed:", error);
    }
}

// --- Entry Point ---

document.addEventListener('DOMContentLoaded', () => {
    ctlIcon.addEventListener('click', handleIconClick);
    window.websim.addEventListener('comment:created', handleRealtimeComment);
    
    initializeApp();
});