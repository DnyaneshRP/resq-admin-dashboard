// --- Supabase SDK Imports ---
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.44.3/+esm';

// =================================================================
// YOUR SUPABASE CONFIGURATION (Ensures connection to the Reports Table)
// =================================================================
const SUPABASE_URL = 'https://ayptiehjxxincwsbtysl.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5cHRpZWhqeHhpbmN3c2J0eXNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1OTY2NzIsImV4cCI6MjA3NjE3MjY3Mn0.jafnb-fxqWbZm7uJf2g17CgiGzS-MetDY1h0kV-d0vg'; 
const REPORT_BUCKET = 'emergency_photos'; 
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
 * Generates a direct Google Maps URL using latitude and longitude.
 * This is the 'free map alternative' that avoids the API key gray box error.
 */
function generateMapUrl(lat, lon) {
    if (lat && lon) {
        // Simple and reliable URL for a place marker on Google Maps
        return `https://www.google.com/maps/place/${lat},${lon}`;
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

// --- Stage 0: Back Button Logic ---

/**
 * Handles navigation back through the 3-stage report view.
 * Stage 3 (Detail) -> Stage 2 (User Reports)
 * Stage 2 (User Reports) -> Stage 1 (All Users)
 */
function handleBack() {
    if (CURRENT_VIEW === 'detail') {
        // Back from Report Detail (Stage 3) to User Reports (Stage 2)
        const reportId = reportDetailEl().dataset.reportId;
        const report = ALL_REPORTS.find(r => r.id === reportId);

        if (report) {
            const userName = report.profiles?.fullname || `User ID: ${report.user_id.substring(0, 8)}...`;
            renderUserReports(report.user_id, userName);
        } else {
            renderUserList(); // Fallback to list if report is missing
        }
    } else if (CURRENT_VIEW === 'reports') {
        // Back from User Reports (Stage 2) to All Users (Stage 1)
        renderUserList(); 
    }
}


// --- Stage 1: Fetch and Render Unique Users (Initial View) ---

async function fetchUsersWithReports() {
    // Show loading state
    userListEl().innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> Loading user reports...</div>';
    
    // Fetch all reports and join profile data, sorted by timestamp (most recent first)
    const { data, error } = await supabase
        .from('emergency_reports')
        .select('*, profiles(*)') 
        .order('timestamp', { ascending: false });

    if (error) {
        console.error('Error fetching reports:', error);
        showMessage('Error fetching reports: ' + error.message, 'error', 7000);
        userListEl().innerHTML = '<p class="text-center">Failed to load reports. **Action Required: Check RLS policy.**</p>';
        return;
    }

    ALL_REPORTS = data;
    
    // Group reports by user_id to find unique reporters
    const userMap = new Map();

    data.forEach(report => {
        const userId = report.user_id;
        if (!userId) return; 

        if (!userMap.has(userId)) {
            userMap.set(userId, {
                profile: report.profiles || { fullname: 'Unknown User' },
                reportCount: 0,
                lastReportTime: 0,
                reports: []
            });
        }
        const userEntry = userMap.get(userId);
        userEntry.reportCount++;
        userEntry.reports.push(report);
        const currentTimestamp = new Date(report.timestamp).getTime();
        if (currentTimestamp > userEntry.lastReportTime) {
            userEntry.lastReportTime = currentTimestamp;
        }
    });
    
    // Convert Map values to an array, sort by last report time (newest reporter first)
    UNIQUE_USERS = Array.from(userMap.values())
        .sort((a, b) => b.lastReportTime - a.lastReportTime);
        
    renderUserList();
}

function renderUserList() {
    CURRENT_VIEW = 'users';
    
    // UI visibility
    userListEl().classList.remove('hidden');
    reportListEl().classList.add('hidden');
    reportDetailEl().classList.add('hidden');
    backButtonEl().classList.add('hidden');
    titleEl().textContent = 'User Reports Overview';
    subtitleEl().textContent = `Displaying reports from ${UNIQUE_USERS.length} unique users, newest first.`;


    if (UNIQUE_USERS.length === 0) {
        userListEl().innerHTML = '<p class="text-center">No current emergency reports found.</p>';
        return;
    }

    userListEl().innerHTML = UNIQUE_USERS.map(userEntry => {
        const profile = userEntry.profile;
        const userId = userEntry.reports[0].user_id;
        const fullName = profile.fullname || `User ID: ${userId.substring(0, 8)}...`;
        const lastReportDate = new Date(userEntry.lastReportTime).toLocaleString();

        return `
            <div class="user-card" data-user-id="${userId}" data-user-name="${fullName}">
                <div class="user-card-content">
                    <i class="fas fa-user-circle"></i>
                    <div>
                        <h3>${fullName}</h3>
                        <p>Total Reports: <strong>${userEntry.reportCount}</strong></p>
                        <p>Last Report: ${lastReportDate}</p>
                    </div>
                </div>
                <i class="fas fa-chevron-right"></i>
            </div>
        `;
    }).join('');

    // Attach click listeners to user cards
    document.querySelectorAll('.user-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const userId = e.currentTarget.dataset.userId;
            const userName = e.currentTarget.dataset.userName;
            renderUserReports(userId, userName);
        });
    });
}

// --- Stage 2: Render Reports for a Specific User ---

function renderUserReports(userId, userName) {
    CURRENT_VIEW = 'reports';

    const userReports = ALL_REPORTS
        .filter(report => report.user_id === userId)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()); 

    // UI visibility
    userListEl().classList.add('hidden');
    reportListEl().classList.remove('hidden');
    reportDetailEl().classList.add('hidden');
    backButtonEl().classList.remove('hidden'); // Show back button
    titleEl().textContent = userName;
    subtitleEl().textContent = `Viewing ${userReports.length} reports submitted by this user (newest first).`;

    reportListEl().innerHTML = userReports.map(report => {
        const date = new Date(report.timestamp).toLocaleString();
        const mapUrl = generateMapUrl(report.latitude, report.longitude); // Use corrected URL

        return `
            <div class="report-list-item" data-report-id="${report.id}">
                <div class="report-item-header">
                    <h4>${report.incident_type || 'Unknown Incident'}</h4>
                    <span class="status-tag ${report.status}">${report.status}</span>
                </div>
                <p><strong>Time:</strong> ${date}</p>
                <p><strong>Location:</strong> <a href="${mapUrl}" target="_blank" class="text-link">Map Link</a></p>
                <i class="fas fa-eye"></i>
            </div>
        `;
    }).join('');

    // Attach click listeners to report items
    document.querySelectorAll('.report-list-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const reportId = e.currentTarget.dataset.reportId;
            renderReportDetail(reportId);
        });
    });
}

// --- Stage 3: Render Report and Profile Details ---

function renderReportDetail(reportId) {
    CURRENT_VIEW = 'detail';
    const report = ALL_REPORTS.find(r => r.id === reportId);
    if (!report) return;

    const profile = report.profiles || {};
    const photoLink = report.photo_url ? getPublicPhotoUrl(report.photo_url) : null;
    const date = new Date(report.timestamp).toLocaleString();
    const mapUrl = generateMapUrl(report.latitude, report.longitude); // Use corrected URL

    // UI visibility
    userListEl().classList.add('hidden');
    reportListEl().classList.add('hidden');
    reportDetailEl().classList.remove('hidden');
    backButtonEl().classList.remove('hidden'); // Keep back button visible
    titleEl().textContent = `Report #${reportId.substring(0, 8)}`;
    subtitleEl().textContent = `${report.incident_type} reported on ${date}`;
    reportDetailEl().dataset.reportId = reportId; // Store for back navigation

    // Map/Location content
    const locationInfoHtml = report.latitude && report.longitude ? 
        `<a href="${mapUrl}" target="_blank" class="main-button secondary-button" style="width: auto;"><i class="fas fa-map-marker-alt"></i> View on Google Maps</a>` : 
        `<div class="map-placeholder">Geospatial location data is not available for this report.</div>`;
    
    // Photo content
    const photoHtml = photoLink ? 
        `<div class="detail-photo-container"><img src="${photoLink}" alt="Incident Photo" class="report-photo"></div><p><a href="${photoLink}" target="_blank" class="text-link">Open Full Image</a></p>` :
        `<p class="text-center" style="font-style: italic; color: #777;">No photo provided.</p>`;

    // Status dropdown
    const statusOptions = ['Reported', 'Assigned', 'Resolved'];
    const statusDropdownHtml = `
        <select class="status-dropdown" data-report-id="${report.id}" data-current-status="${report.status}">
            ${statusOptions.map(status => 
                `<option value="${status}" ${report.status === status ? 'selected' : ''}>${status}</option>`
            ).join('')}
        </select>
    `;

    reportDetailEl().innerHTML = `
        <div class="detail-content-section report-details-panel">
            <h3>Incident Details</h3>
            <div class="detail-grid">
                <div><strong>Type:</strong> ${report.incident_type || 'N/A'}</div>
                <div><strong>Severity:</strong> <span class="severity-tag severity-${report.severity_level?.toLowerCase() || 'low'}">${report.severity_level || 'Low'}</span></div>
                <div><strong>Timestamp:</strong> ${date}</div>
                <div><strong>Current Status:</strong> ${statusDropdownHtml}</div>
            </div>

            <p><strong>Description:</strong> ${report.incident_details || 'No additional details provided.'}</p>
            
            <hr>

            <h3>Location & Media</h3>
            <p><strong>Coordinates:</strong> ${report.latitude || 'N/A'}, ${report.longitude || 'N/A'}</p>
            ${locationInfoHtml}
            
            <div style="margin-top: 20px;">
                <h4>Attached Photo:</h4>
                ${photoHtml}
            </div>
            
            <div class="report-detail-footer">
                <button id="updateStatusBtn" class="main-button hidden" disabled>Update Status</button>
            </div>
        </div>

        <div class="detail-content-section profile-details-panel">
            <h3>Reporter Profile</h3>
            <p><strong>Full Name:</strong> ${profile.fullname || 'N/A'}</p>
            <p><strong>Phone:</strong> ${profile.phone || 'N/A'}</p>
            <p><strong>Email:</strong> ${profile.email || 'N/A'}</p>
            <p><strong>User ID (Supabase):</strong> <code>${report.user_id}</code></p>
        </div>
    `;

    // Attach listener to dropdown
    reportDetailEl().querySelector('.status-dropdown').addEventListener('change', handleStatusUpdate);
}

// --- Status Update Logic ---
async function handleStatusUpdate(e) {
    const dropdown = e.target;
    const reportId = dropdown.dataset.reportId;
    const newStatus = dropdown.value;
    const oldStatus = dropdown.dataset.currentStatus;

    if (newStatus === oldStatus) return;

    dropdown.disabled = true;
    showMessage(`Updating status of Report ID ${reportId.substring(0, 8)}... to ${newStatus}...`, 'info', 2000);

    const { error } = await supabase
        .from('emergency_reports')
        .update({ status: newStatus })
        .eq('id', reportId)
        .select();

    dropdown.disabled = false;

    if (error) {
        console.error('Status update failed:', error);
        showMessage('Failed to update status: ' + error.message, 'error', 5000);
        dropdown.value = oldStatus; // Revert selection
    } else {
        showMessage(`Report ${reportId.substring(0, 8)} status successfully set to ${newStatus}.`, 'success', 3000);
        dropdown.dataset.currentStatus = newStatus; // Update stored status
        // A full re-fetch ensures the global ALL_REPORTS state is updated for consistency
        fetchUsersWithReports(); 
    }
}


// =================================================================
// --- Broadcast Module ---
// =================================================================

async function handleBroadcast(e) {
    e.preventDefault();
    const form = e.target;
    const messageInput = document.getElementById('broadcastMessage');
    const message = messageInput.value.trim();

    if (!message) {
        showMessage('Broadcast message cannot be empty.', 'error', 3000);
        return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

    // Insert message into the 'broadcasts' table
    const { error } = await supabase
        .from('broadcasts') 
        .insert([{ message: message }]); 

    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Broadcast';

    if (error) {
        console.error('Broadcast failed:', error);
        showMessage('Broadcast failed: ' + error.message + '. Check the broadcasts table and RLS permissions.', 'error', 7000);
    } else {
        showMessage('Broadcast sent successfully to all connected users!', 'success', 4000);
        form.reset();
    }
}


// =================================================================
// --- Initialization ---
// =================================================================

document.addEventListener('DOMContentLoaded', () => {
    
    // Attempt to authenticate first
    const isAuthenticated = checkAuth();

    // --- Login Page Setup ---
    if (!isAuthenticated && (window.location.pathname.endsWith('/index.html') || window.location.pathname.endsWith('/'))) {
        const loginForm = document.getElementById('adminLoginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', handleLogin);
        }
    }

    // --- Dashboard Setup ---
    if (isAuthenticated && window.location.pathname.endsWith('/dashboard.html')) {
        
        // 1. Initial Content Loading
        fetchUsersWithReports(); 

        // 2. Navigation Setup
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
            });
        });

        // 3. Report Back and Refresh Button functionality
        const refreshBtn = document.getElementById('refreshReportsBtn');
        if (refreshBtn) {
            // Refresh always fetches the main user list (Stage 1)
            refreshBtn.addEventListener('click', fetchUsersWithReports);
        }

        const backBtn = document.getElementById('backToUsersBtn');
        if (backBtn) {
            // Back button handles the multi-stage navigation
            backBtn.addEventListener('click', handleBack);
        }

        // 4. Broadcast Form Submission
        const broadcastForm = document.getElementById('broadcastForm');
        if (broadcastForm) {
            broadcastForm.addEventListener('submit', handleBroadcast);
        }
    }
});