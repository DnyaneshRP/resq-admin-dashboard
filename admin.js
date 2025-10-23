// --- Supabase SDK Imports ---
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.44.3/+esm';

// =================================================================
// YOUR SUPABASE CONFIGURATION (Ensures connection to the Reports Table)
// =================================================================
const SUPABASE_URL = 'https://ayptiehjxxincwsbtysl.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5cHRpZWhqeHhpbmN3c2J0eXNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1OTY2NzIsImV4cCI6MjA3NjE3MjY3Mn0.jafnb-fxqWbZm7uJf2g17CgiGzS-MetDY1h0kV-d0vg'; 
const REPORT_BUCKET = 'emergency_photos'; 
const BROADCASTS_TABLE = 'broadcasts'; // <<< NEW CONSTANT
// CRITICAL FIX: The user app inserts into 'emergency_reports'
const REPORTS_TABLE = 'emergency_reports'; // <<< CORRECTED CONSTANT
// =================================================================

// --- Initialize Supabase Client ---
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Define fixed Admin credentials
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin';
const SESSION_KEY = 'resq_admin_session'; // Session key for localStorage

// Global state to hold all reports and selected user
let ALL_REPORTS = []; 
let UNIQUE_USERS = [];
let CURRENT_VIEW = 'users'; // 'users', 'reports', 'detail'

// DOM Elements utility functions
const userListEl = () => document.getElementById('userList');
const reportListEl = () => document.getElementById('reportList');
const reportDetailEl = () => document.getElementById('reportDetail');
const backButtonEl = () => document.getElementById('backToUsersBtn');
const titleEl = () => document.getElementById('reportPageTitle');
const subtitleEl = () => document.getElementById('reportPageSubtitle');

// =================================================================
// --- Global Utilities ---
// =================================================================

function showMessage(message, type = 'success', duration = 3000) {
    const messageBox = document.getElementById('customMessageBox');
    if (!messageBox) return;

    messageBox.className = `custom-message-box hidden ${type}`;
    messageBox.textContent = message;

    setTimeout(() => {
        messageBox.classList.remove('hidden');
        messageBox.classList.add('show');
    }, 10); 

    setTimeout(() => {
        messageBox.classList.remove('show');
        setTimeout(() => {
            messageBox.classList.add('hidden');
        }, 300); 
    }, duration);
}

function getPublicPhotoUrl(filePath) {
    try {
        const { data } = supabase.storage
            .from(REPORT_BUCKET)
            .getPublicUrl(filePath);
        return data.publicUrl;
    } catch (e) {
        console.error("Failed to generate public URL:", e);
        return null;
    }
}

/**
 * Generates an OpenStreetMap (OSM) embed URL using iframe.
 */
function generateOsmIframe(lat, lon) {
    if (lat && lon) {
        const d = 0.005; 
        const lon1 = lon - d;
        const lat1 = lat - d;
        const lon2 = lon + d;
        const lat2 = lat + d;
        
        return `<iframe class="embedded-map"
                    frameborder="0" scrolling="no" marginheight="0" marginwidth="0" 
                    src="https://www.openstreetmap.org/export/embed.html?bbox=${lon1},${lat1},${lon2},${lat2}&layer=mapnik&marker=${lat},${lon}"></iframe>`;
    }
    return null;
}

/**
 * Generates a simple Google Maps URL for a new tab/window.
 */
function generateMapUrl(lat, lon) {
    if (lat && lon) {
         // Using the full Google Maps URL format for better compatibility
        return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
    }
    return '#';
}


// =================================================================
// --- Authentication ---
// =================================================================

function checkAuth() {
    const isAuthenticated = localStorage.getItem(SESSION_KEY) === 'true';
    const currentPath = window.location.pathname.split('/').pop();

    if (isAuthenticated) {
        if (currentPath === 'index.html' || currentPath === '') {
            window.location.href = 'dashboard.html';
        }
    } else {
        if (currentPath !== 'index.html' && currentPath !== '') {
            window.location.href = 'index.html';
        }
    }
    return isAuthenticated;
}

function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        localStorage.setItem(SESSION_KEY, 'true');
        showMessage('Login successful! Redirecting...', 'success', 1000);
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1000);
    } else {
        showMessage('Login failed: Invalid username or password.', 'error', 3000);
    }
}

function handleLogout() {
    localStorage.removeItem(SESSION_KEY);
    showMessage('Logged out successfully.', 'success', 1000);
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 500);
}

// =================================================================
// --- Reports Dashboard Module (3-Stage View) ---
// =================================================================

/**
 * Fetches all reports and groups them by user to display in the initial view.
 */
async function fetchUsersWithReports() {
    titleEl().textContent = 'Loading Reports...';
    subtitleEl().textContent = 'Please wait while we fetch the latest data.';
    userListEl().innerHTML = '<div class="text-center"><i class="fas fa-spinner fa-spin" style="font-size: 24px;"></i></div>';

    try {
        // CRITICAL FIX: Querying the correct table 'emergency_reports'
        const { data: reports, error } = await supabase
            .from(REPORTS_TABLE) 
            .select('*, profiles (id, fullname, email, phone)') 
            .order('timestamp', { ascending: false }); // Assuming 'timestamp' or 'created_at' is used for ordering

        if (error) throw error;
        
        ALL_REPORTS = reports;
        
        // Group reports by user
        const reportsByUser = reports.reduce((acc, report) => {
            const userId = report.user_id;
            if (!acc[userId]) {
                acc[userId] = {
                    profile: report.profiles,
                    reportCount: 0,
                    pendingCount: 0,
                    lastReportDate: null
                };
            }
            acc[userId].reportCount++;
            // Assuming 'Reported' is the initial status from user app
            if (report.status === 'Reported' || report.status === 'Pending') { 
                acc[userId].pendingCount++;
            }
            // Update last report date (using 'timestamp' which is what the user app submits)
            const currentReportDate = new Date(report.timestamp || report.created_at);
            if (!acc[userId].lastReportDate || currentReportDate > acc[userId].lastReportDate) {
                acc[userId].lastReportDate = currentReportDate;
            }
            return acc;
        }, {});

        UNIQUE_USERS = Object.keys(reportsByUser).map(userId => reportsByUser[userId]);

        renderUserList();
        titleEl().textContent = 'User Reports';
        subtitleEl().textContent = 'Select a user to view their submitted reports.';

    } catch (e) {
        console.error('Error fetching reports:', e);
        showMessage(`Error fetching reports: ${e.message}`, 'error');
        titleEl().textContent = 'Report Loading Failed';
        subtitleEl().textContent = 'Could not load data. Check console for details.';
        userListEl().innerHTML = '<p class="text-center">Failed to load reports.</p>';
    }
}

/**
 * Renders the list of unique users who have submitted reports.
 */
function renderUserList() {
    if (CURRENT_VIEW !== 'users') return;

    userListEl().classList.remove('hidden');
    reportListEl().classList.add('hidden');
    reportDetailEl().classList.add('hidden');
    if(backButtonEl()) backButtonEl().classList.add('hidden');

    if (UNIQUE_USERS.length === 0) {
        userListEl().innerHTML = '<p class="text-center">No reports have been submitted yet.</p>';
        return;
    }

    const listHtml = UNIQUE_USERS.sort((a, b) => b.lastReportDate - a.lastReportDate).map(user => {
        const profile = user.profile;
        const dateText = user.lastReportDate ? new Date(user.lastReportDate).toLocaleString() : 'N/A';
        // Check for 'Reported' or 'Pending' as initial/pending states
        const pendingBadge = user.pendingCount > 0 ? `<span class="count-badge">${user.pendingCount} Pending</span>` : '';
        
        return `
            <div class="user-card" data-user-id="${profile.id}">
                <div class="user-info">
                    <h3><i class="fas fa-user-circle"></i> ${profile.fullname || 'Unknown User'}</h3>
                    <p class="email-text"><i class="fas fa-envelope"></i> ${profile.email}</p>
                    <p class="email-text"><i class="fas fa-phone"></i> ${profile.phone || 'N/A'}</p>
                </div>
                <div class="report-stats">
                    ${pendingBadge}
                    <span class="count-badge total-badge">${user.reportCount} Total Reports</span>
                    <small>Last Report: ${dateText}</small>
                </div>
                <i class="fas fa-chevron-right"></i>
            </div>
        `;
    }).join('');

    userListEl().innerHTML = listHtml;
    
    // Add click listeners to user cards
    document.querySelectorAll('.user-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const userId = e.currentTarget.dataset.userId;
            renderReportList(userId);
        });
    });
}

/**
 * Renders the list of reports for a selected user.
 */
function renderReportList(userId) {
    CURRENT_VIEW = 'reports';

    const userReports = ALL_REPORTS.filter(report => report.user_id === userId);
    const userProfile = userReports[0]?.profiles || { fullname: 'Unknown User' };

    titleEl().textContent = `${userProfile.fullname}'s Reports`;
    subtitleEl().textContent = `Total reports: ${userReports.length}`;
    
    userListEl().classList.add('hidden');
    reportListEl().classList.remove('hidden');
    reportDetailEl().classList.add('hidden');
    if(backButtonEl()) backButtonEl().classList.remove('hidden');
    
    if(backButtonEl()) backButtonEl().onclick = () => {
        CURRENT_VIEW = 'users';
        renderUserList(); // Go back to the user list view
        titleEl().textContent = 'User Reports';
        subtitleEl().textContent = 'Select a user to view their submitted reports.';
    };

    const listHtml = userReports.map(report => {
        const date = new Date(report.timestamp || report.created_at).toLocaleString();
        const statusClass = report.status.replace(/\s/g, ''); // For CSS matching
        const locationText = report.latitude && report.longitude 
            ? 'Location Recorded' 
            : 'No Location Data';

        return `
            <div class="report-list-card" data-report-id="${report.id}">
                <div class="report-info-main">
                    <h4>${report.incident_type}</h4>
                    <span class="severity-tag severity-${report.severity_level.toLowerCase()}">${report.severity_level}</span>
                </div>
                <div class="report-info-sub">
                    <p><strong>Status:</strong> <span class="status-tag ${statusClass}">${report.status}</span></p>
                    <p><strong>Time:</strong> ${date}</p>
                    <p><strong>Location:</strong> ${locationText}</p>
                </div>
                <i class="fas fa-chevron-right"></i>
            </div>
        `;
    }).join('');

    reportListEl().innerHTML = listHtml;

    // Add click listeners to report cards
    document.querySelectorAll('.report-list-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const reportId = e.currentTarget.dataset.reportId;
            // The original file used report.id as the primary key. Assuming it is a string.
            const report = ALL_REPORTS.find(r => r.id == reportId); 
            if (report) {
                renderReportDetail(report);
            }
        });
    });
}

/**
 * Renders the detailed view of a single report.
 */
function renderReportDetail(report) {
    CURRENT_VIEW = 'detail';

    const userProfile = report.profiles;
    titleEl().textContent = `${report.incident_type} Report`;
    subtitleEl().textContent = `Reported by ${userProfile.fullname}`;

    userListEl().classList.add('hidden');
    reportListEl().classList.add('hidden');
    reportDetailEl().classList.remove('hidden');
    if(backButtonEl()) backButtonEl().classList.remove('hidden');

    // Update back button to go back to the report list (user view)
    if(backButtonEl()) backButtonEl().onclick = () => {
        renderReportList(report.user_id);
    };

    const date = new Date(report.timestamp || report.created_at).toLocaleString();
    const statusClass = report.status.replace(/\s/g, ''); 
    const mapIframe = generateOsmIframe(report.latitude, report.longitude);
    const mapLink = generateMapUrl(report.latitude, report.longitude);
    const photoUrl = report.photo_url ? getPublicPhotoUrl(report.photo_url) : null;
    const photoHtml = photoUrl 
        ? `<div class="detail-photo"><img src="${photoUrl}" alt="Report Photo"><a href="${photoUrl}" target="_blank" class="text-link">View Full Photo</a></div>` 
        : '<p class="no-data"><i class="fas fa-camera"></i> No photo attached.</p>';
    
    const locationHtml = report.latitude && report.longitude 
        ? `
            <p><strong>Coordinates:</strong> ${report.latitude.toFixed(4)}, ${report.longitude.toFixed(4)} 
                (<a href="${mapLink}" target="_blank">Open in Maps</a>)</p>
            ${mapIframe}
        ` 
        : '<p class="no-data"><i class="fas fa-map-marker-alt"></i> Location not recorded.</p>';

    const detailHtml = `
        <div class="report-detail-card">
            <div class="detail-header">
                <h2>${report.incident_type}</h2>
                <div class="status-group">
                    <span class="severity-tag severity-${report.severity_level.toLowerCase()}">${report.severity_level} Severity</span>
                    <span class="status-tag ${statusClass}">${report.status}</span>
                </div>
            </div>

            <div class="detail-section">
                <h3>Report Info</h3>
                <p><strong>Report ID:</strong> ${report.id}</p>
                <p><strong>Time:</strong> ${date}</p>
                <p><strong>Details:</strong> ${report.incident_details || 'N/A'}</p>
                <p><strong>User Feedback:</strong> ${report.user_feedback || 'N/A'}</p>
            </div>

            <div class="detail-section">
                <h3>Reporter Info</h3>
                <p><strong>Name:</strong> ${userProfile.fullname || 'N/A'}</p>
                <p><strong>Email:</strong> ${userProfile.email || 'N/A'}</p>
                <p><strong>Phone:</strong> ${userProfile.phone || 'N/A'}</p>
            </div>

            <div class="detail-section">
                <h3>Location & Media</h3>
                ${locationHtml}
                ${photoHtml}
            </div>

            <div class="detail-section">
                <h3>Update Status</h3>
                <form class="status-update-form" data-report-id="${report.id}">
                    <select name="status" required>
                        <option value="Reported" ${report.status === 'Reported' ? 'selected' : ''}>Reported</option>
                        <option value="In Progress" ${report.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                        <option value="Assigned" ${report.status === 'Assigned' ? 'selected' : ''}>Assigned</option>
                        <option value="Resolved" ${report.status === 'Resolved' ? 'selected' : ''}>Resolved</option>
                    </select>
                    <button type="submit" class="secondary-button">Update</button>
                </form>
            </div>
        </div>
    `;
    
    reportDetailEl().innerHTML = detailHtml;

    // Add submit listener for status update
    document.querySelector('.status-update-form').addEventListener('submit', handleStatusUpdate);
}

/**
 * Handles the status update form submission.
 */
async function handleStatusUpdate(e) {
    e.preventDefault();
    const form = e.target;
    const reportId = form.dataset.reportId;
    const newStatus = form.elements['status'].value;
    
    // Find the report object to get the user_id for list return
    const currentReport = ALL_REPORTS.find(r => r.id == reportId);
    
    if (!currentReport) {
        showMessage('Error: Report not found in local data.', 'error');
        return;
    }

    try {
        // CRITICAL FIX: Update the correct table 'emergency_reports'
        const { error } = await supabase
            .from(REPORTS_TABLE) 
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', reportId);

        if (error) throw error;

        // Update local state and re-render the detail view
        const index = ALL_REPORTS.findIndex(r => r.id == reportId);
        if (index !== -1) {
            ALL_REPORTS[index].status = newStatus;
            ALL_REPORTS[index].updated_at = new Date().toISOString();
        }
        
        // Re-render the detail view to show the new status immediately
        renderReportDetail(ALL_REPORTS[index]); 

        // Also update the UNIQUE_USERS list pending count logic
        await fetchUsersWithReports(); // Re-fetch or re-calculate user summary data
        
        showMessage(`Report ${reportId} status updated to: ${newStatus}`, 'success');

    } catch (e) {
        console.error('Error updating status:', e);
        showMessage(`Status update failed: ${e.message}`, 'error');
    }
}

// =================================================================
// --- Broadcast Module ---
// =================================================================

/**
 * Handles the broadcast form submission.
 */
async function handleBroadcast(e) {
    e.preventDefault();
    const form = document.getElementById('broadcastForm');
    const messageEl = document.getElementById('broadcastMessage');
    const message = messageEl.value.trim();

    if (!message) {
        showMessage('Broadcast message cannot be empty.', 'error');
        return;
    }

    const confirmSend = confirm(`Are you sure you want to send the following critical broadcast to all users?\n\n"${message}"`);

    if (!confirmSend) {
        return;
    }

    // Disable button to prevent double submission
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

    try {
        // CRITICAL FIX: Changed column from 'body' to 'message' to match client's listener expectation.
        const { data, error } = await supabase
            .from(BROADCASTS_TABLE)
            .insert({ 
                title: 'CRITICAL ALERT', // Fixed title for severity
                message: message // Use 'message' column for the text
            })
            .select();

        if (error) throw error;

        // The client-side listener (app.js) is now correctly set up to receive the postgres_changes INSERT event on this table.
        // If you are using Supabase Edge Functions or third-party services for push notifications, they would be triggered by this DB insert.

        showMessage('Broadcast sent successfully! All subscribed users should receive the alert.', 'success', 5000);
        messageEl.value = ''; // Clear the form

    } catch (e) {
        console.error('Broadcast failed:', e);
        showMessage(`Broadcast failed: ${e.message || 'Database error occurred.'}`, 'error', 5000);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Broadcast';
    }
}


// =================================================================
// --- Main Entry Point ---
// =================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Attempt to handle login form submission on the index page
    const loginForm = document.getElementById('adminLoginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Run auth check on all pages
    const isAuthenticated = checkAuth();

    // --- Dashboard Setup ---
    if (isAuthenticated && window.location.pathname.endsWith('/dashboard.html')) {
        
        // 1. Initial Content Loading & Navigation Setup
        fetchUsersWithReports(); 

        // 2. Tab Switching
        document.querySelectorAll('.navbar a').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = e.target.dataset.target;

                if (e.target.id === 'navLogout') {
                    handleLogout();
                    return;
                }

                // Handle Tab Switching
                document.querySelectorAll('.content-section').forEach(section => {
                    section.classList.remove('active');
                });
                document.getElementById(targetId).classList.add('active');

                document.querySelectorAll('.navbar a').forEach(nav => {
                    nav.classList.remove('active');
                });
                e.target.classList.add('active');
                
                // If switching to reports, ensure the correct view is loaded
                if (targetId === 'reports') {
                    if (CURRENT_VIEW === 'users') {
                        renderUserList();
                    } else if (CURRENT_VIEW === 'reports') {
                        // Re-render report list for the current user, or go back to users if state is lost
                        // Find the user ID of the first report in the list to re-render the report list
                        const userId = ALL_REPORTS.find(r => r.user_id)?.user_id;
                        if (userId) {
                            renderReportList(userId);
                        } else {
                            renderUserList();
                        }
                    } else if (CURRENT_VIEW === 'detail') {
                        // No-op: keep the detail view open
                    }
                }
            });
        });

        // 3. Report Refresh Button
        const refreshBtn = document.getElementById('refreshReportsBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', fetchUsersWithReports);
        }
        
        // 4. Back Button Setup (initial state is hidden, handler is set in render functions)
        // The simple back button logic is now handled dynamically in renderReportList and renderReportDetail
        // to ensure it goes to the correct previous view.
        


        // 5. Broadcast Form Submission
        const broadcastForm = document.getElementById('broadcastForm');
        if (broadcastForm) {
            broadcastForm.addEventListener('submit', handleBroadcast);
        }
    }
});