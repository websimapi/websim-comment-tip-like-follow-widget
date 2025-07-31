import { marked } from 'marked';
import DOMPurify from 'dompurify';

// --- DOM Elements ---
const ctlIcon = document.getElementById('ctl-icon');
const ctlHeart = document.getElementById('ctl-heart');
const ctlTipAmount = document.getElementById('ctl-tip-amount');
const commentsSection = document.getElementById('comments-section');
const commentsList = document.getElementById('comments-list');
const commentForm = document.getElementById('comment-form');
const commentInput = document.getElementById('comment-input');

let project = null;
let currentUser = null;

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
 * Processes comments to calculate user-specific data for the icon.
 * @param {Array} comments - The list of comments.
 * @param {string} userId - The ID of the current user.
 * @returns {object} An object containing total tips and whether the user has reacted.
 */
function processUserData(comments, userId) {
    let totalTips = 0;
    let hasReacted = false;

    for (const comment of comments) {
        // Check for tips from the current user
        if (comment.author.id === userId && comment.card_data?.type === 'tip_comment') {
            totalTips += comment.card_data.credits_spent;
        }
        // Check if the user has reacted to any comment
        if (comment.reactions?.some(reaction => reaction.me)) {
            hasReacted = true;
        }
    }

    return { totalTips, hasReacted };
}


/**
 * Updates the floating icon's appearance based on user data.
 * @param {number} totalTips - Total credits tipped by the user.
 * @param {boolean} hasReacted - True if the user has liked/reacted to any comment.
 */
function updateFloatingIcon(totalTips, hasReacted) {
    if (hasReacted) {
        ctlHeart.style.display = 'block';
    }
    if (totalTips > 0) {
        ctlTipAmount.textContent = `+${totalTips}`;
        ctlTipAmount.style.display = 'block';
    }
}

// --- UI Rendering ---

/**
 * Renders a single comment object into the DOM.
 * @param {object} comment - The comment object to render.
 */
function renderComment(comment) {
    const commentEl = document.createElement('div');
    commentEl.className = 'comment';
    commentEl.id = `comment-${comment.id}`;

    const sanitizedContent = DOMPurify.sanitize(marked.parse(comment.raw_content));
    const commentDate = new Date(comment.created_at).toLocaleString();

    let tipBadge = '';
    if (comment.card_data?.type === 'tip_comment') {
        tipBadge = `<span class="tip-badge">Tipped ${comment.card_data.credits_spent} credits</span>`;
    }

    commentEl.innerHTML = `
        <div class="comment-header">
            <span class="comment-author">${comment.author.display_name || comment.author.username}</span>
            <span class="comment-date">${commentDate}</span>
            ${tipBadge}
        </div>
        <div class="comment-content">${sanitizedContent}</div>
    `;
    return commentEl;
}

/**
 * Renders a list of comments, clearing the previous list.
 * @param {Array} comments - An array of comment objects.
 */
function renderAllComments(comments) {
    commentsList.innerHTML = '';
    if (comments.length === 0) {
        commentsList.innerHTML = '<p>No comments yet. Be the first!</p>';
        return;
    }
    
    const topLevelComments = comments.filter(c => !c.parent_comment_id);
    topLevelComments.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    topLevelComments.forEach(comment => {
        const commentEl = renderComment(comment);
        commentsList.appendChild(commentEl);
    });
}

// --- Event Handlers ---

function handleIconClick() {
    commentsSection.scrollIntoView({ behavior: 'smooth' });
}

async function handleCommentSubmit(event) {
    event.preventDefault();
    const content = commentInput.value.trim();
    if (!content) return;

    const button = event.target.querySelector('button');
    button.disabled = true;
    button.textContent = 'Posting...';

    const result = await window.websim.postComment({ content });

    if (result && result.error) {
        console.error('Failed to post comment:', result.error);
        alert(`Error: ${result.error}`);
    } else {
        commentInput.value = '';
    }
    
    button.disabled = false;
    button.textContent = 'Post';
}

function handleRealtimeComment(data) {
    console.log('New comment received:', data);
    const newComment = data.comment;
    
    // For simplicity, we'll just refetch and re-render all comments.
    // A more complex app could insert the comment smartly.
    initializeApp();
}


// --- Initialization ---

async function initializeApp() {
    try {
        project = await window.websim.getCurrentProject();
        currentUser = await window.websim.getCurrentUser();

        if (!project || !currentUser) {
            commentsList.innerHTML = '<p>Could not load project or user data.</p>';
            return;
        }

        const allComments = await fetchAllComments(project.id);
        
        renderAllComments(allComments);
        
        const { totalTips, hasReacted } = processUserData(allComments, currentUser.id);
        updateFloatingIcon(totalTips, hasReacted);

    } catch (error) {
        console.error("Initialization failed:", error);
        commentsList.innerHTML = '<p>An error occurred while loading comments.</p>';
    }
}


// --- Entry Point ---

document.addEventListener('DOMContentLoaded', () => {
    ctlIcon.addEventListener('click', handleIconClick);
    commentForm.addEventListener('submit', handleCommentSubmit);
    window.websim.addEventListener('comment:created', handleRealtimeComment);
    
    initializeApp();
});

