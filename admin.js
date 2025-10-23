// --- Supabase SDK Imports ---
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.44.3/+esm';

// =================================================================
// YOUR SUPABASE CONFIGURATION (Ensures connection to the Reports Table)
// =================================================================
const SUPABASE_URL = 'https://ayptiehjxxincwsbtysl.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5cHRpZWhqeHhpbmN3c2J0eXNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1OTY2NzIsImV4cCI6MjA3NjE3MjY3Mn0.jafnb-fxqWbZm7uJf2g17CgiGzS-MetDY1h0kV-d0vg'; 
const REPORT_BUCKET = 'emergency_photos'; 
const BROADCASTS_TABLE = 'broadcasts'; // Added back for completeness
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

// --- Stage 0: Back Button Logic ---

function handleBack() {
    if (CURRENT_VIEW === 'detail') {
        const reportId = reportDetailEl().dataset.reportId;
        // Need to find the report to get the user ID for the previous view
        const report = ALL_REPORTS.find(r => r.id == reportId);

        if (report) {
            const userName = report.profiles?.fullname || `User`;
            renderUserReports(report.user_id, userName);
        } else {
            renderUserList(); 
        }
    } else if (CURRENT_VIEW === 'reports') {
        renderUserList(); 
    }
}

// --- Stage 1: Fetch and Render Unique Users (Initial View) ---

async function fetchUsersWithReports() {
    userListEl().innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> Loading user reports...</div>';
    
    // NOTE: Assuming 'emergency_reports' is the correct table name from previous context
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
    
    UNIQUE_USERS = Array.from(userMap.values())
        .sort((a, b) => b.lastReportTime - a.lastReportTime);
        
    renderUserList();
}

function renderUserList() {
    CURRENT_VIEW = 'users';
    
    userListEl().classList.remove('hidden');
    reportListEl().classList.add('hidden');
    reportDetailEl().classList.add('hidden');
    backButtonEl().classList.add('hidden');
    titleEl().textContent = 'User Reports Overview';
    subtitleEl().textContent = `Displaying reports from ${UNIQUE_USERS.length} users.`;


    if (UNIQUE_USERS.length === 0) {
        userListEl().innerHTML = '<p class="text-center">No current emergency reports found.</p>';
        return;
    }

    userListEl().innerHTML = UNIQUE_USERS.map(userEntry => {
        const profile = userEntry.profile;
        const userId = userEntry.reports[0].user_id;
        const fullName = profile.fullname || `User`;
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

    userListEl().classList.add('hidden');
    reportListEl().classList.remove('hidden');
    reportDetailEl().classList.add('hidden');
    backButtonEl().classList.remove('hidden'); 
    titleEl().textContent = `Reports from ${userName}`;
    subtitleEl().textContent = `Viewing ${userReports.length} reports submitted by this user.`;

    reportListEl().innerHTML = userReports.map(report => {
        const date = new Date(report.timestamp).toLocaleString();
        const mapUrl = generateMapUrl(report.latitude, report.longitude); 

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

    document.querySelectorAll('.report-list-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const reportId = e.currentTarget.dataset.reportId;
            renderReportDetail(reportId);
        });
    });
}

/**
 * Generates HTML for profile details, excluding any IDs.
 * FIX: Prioritizes 'fullname' field to display first.
 */
function generateProfileDetails(profile) {
    const excludedKeys = ['id', 'user_id', 'created_at', 'fullname', 'full_name']; 
    
    // CRITICAL FIX: Explicitly check for 'fullname' key (case-insensitive)
    const nameKeys = Object.keys(profile).filter(key => 
        key.toLowerCase() === 'fullname' || key.toLowerCase() === 'full_name'
    );
    const fullNameKey = nameKeys.length > 0 ? nameKeys[0] : null;

    // Get all other keys, excluding internal keys and the name key
    const otherKeys = Object.keys(profile).filter(key => 
        !excludedKeys.includes(key) && key !== fullNameKey && profile[key]
    );

    let html = '';

    // 1. Display Full Name first
    if (fullNameKey && profile[fullNameKey]) {
        html += `
            <div class="detail-item">
                <strong>Fullname:</strong> <span style="font-weight: 600; color: #d32f2f;">${profile[fullNameKey]}</span>
            </div>
        `;
    }
    
    // 2. Display the rest of the details
    otherKeys.forEach(key => {
        // Exclude internal keys
        if (!profile[key]) return;

        // Convert key name (e.g., 'full_name') to a clean label (e.g., 'Full Name')
        const label = key.split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        
        // Display the field
        html += `
            <div class="detail-item">
                <strong>${label}:</strong> <span>${profile[key]}</span>
            </div>
        `;
    });
    
    if (!html) {
        return '<p class="text-center" style="padding: 20px;">No user registration details available.</p>';
    }
    
    return html;
}

// --- Stage 3: Render Report and Profile Details (Updated for 70:30 split) ---

function renderReportDetail(reportId) {
    CURRENT_VIEW = 'detail';
    const report = ALL_REPORTS.find(r => r.id == reportId);
    if (!report) return;

    const profile = report.profiles || {};
    const photoLink = report.photo_url ? getPublicPhotoUrl(report.photo_url) : null;
    const date = new Date(report.timestamp).toLocaleString();
    
    // Generate map embed and Google Maps link
    const mapIframeHtml = generateOsmIframe(report.latitude, report.longitude);
    const mapUrl = generateMapUrl(report.latitude, report.longitude);

    // UI visibility
    userListEl().classList.add('hidden');
    reportListEl().classList.add('hidden');
    reportDetailEl().classList.remove('hidden');
    backButtonEl().classList.remove('hidden'); 
    
    titleEl().textContent = `Emergency Report Detail`; 
    subtitleEl().textContent = `${report.incident_type} reported on ${date}`;
    reportDetailEl().dataset.reportId = reportId;

    // Location & Media content (LEFT SIDE)
    const locationInfoHtml = report.latitude && report.longitude ? 
        `
            <div class="detail-item">
                <strong>Coordinates:</strong> <span>${report.latitude}, ${report.longitude}</span>
            </div>
            
            <a href="${mapUrl}" target="_blank" class="map-link-wrapper" title="Click to view full map on Google Maps">
                <div class="map-container">
                    ${mapIframeHtml}
                </div>
            </a>
        `
        : 
        `<div class="map-placeholder">Geospatial location data is not available for this report.</div>`;
    
    // Photo content
    const photoHtml = photoLink ? 
        `<div class="detail-photo-container">
            <img src="${photoLink}" alt="Incident Photo" class="report-photo">
            <p style="text-align: center;"><a href="${photoLink}" target="_blank" class="text-link">Open Full Image</a></p>
        </div>` 
        :
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

    // Construct the two-column (70:30) HTML structure
    reportDetailEl().innerHTML = `
        
        <div class="report-details-panel">
            
            <div class="detail-card">
                <h3><i class="fas fa-exclamation-triangle"></i> Incident Overview</h3>
                
                <div class="detail-item">
                    <strong>Incident Type:</strong> <span>${report.incident_type || 'N/A'}</span>
                </div>
                
                <div class="detail-item">
                    <strong>Time Reported:</strong> <span>${date}</span>
                </div>
                
                <div class="detail-item">
                    <strong>Severity Level:</strong> <span class="severity-tag severity-${report.severity_level?.toLowerCase() || 'low'}">${report.severity_level || 'Low'}</span>
                </div>
                
                <div class="detail-item">
                    <strong>Current Status:</strong> ${statusDropdownHtml}
                </div>

                <p style="margin-top: 20px;"><strong>Report Description:</strong></p>
                <div class="detail-description-box">
                    ${report.incident_details || 'No additional details provided by the user.'}
                </div>
            </div>

            <div class="detail-card">
                <h3><i class="fas fa-map-marked-alt"></i> Location & Media</h3>
                
                ${locationInfoHtml}
                
                <h4 style="margin-top: 20px; font-weight: 600;">Attached Photo:</h4>
                ${photoHtml}
            </div>
        </div>

        <div class="profile-details-panel">
            <div class="detail-card">
                <h3><i class="fas fa-user-circle"></i> User Profile</h3>
                
                ${generateProfileDetails(profile)}
            </div>
        </div>
    `;

    // Attach listener to dropdown
    reportDetailEl().querySelector('.status-dropdown').addEventListener('change', handleStatusUpdate);
}

// --- Status Update Logic (Keep as is) ---
async function handleStatusUpdate(e) {
    const dropdown = e.target;
    const reportId = dropdown.dataset.reportId;
    const newStatus = dropdown.value;
    const oldStatus = dropdown.dataset.currentStatus;

    if (newStatus === oldStatus) return;

    dropdown.disabled = true;
    showMessage(`Updating status of report to ${newStatus}...`, 'info', 2000);

    const { error } = await supabase
        .from('emergency_reports')
        .update({ status: newStatus })
        .eq('id', reportId)
        .select();

    dropdown.disabled = false;

    if (error) {
        console.error('Status update failed:', error);
        showMessage('Failed to update status: ' + error.message, 'error', 5000);
        dropdown.value = oldStatus; 
    } else {
        showMessage(`Report status successfully set to ${newStatus}.`, 'success', 3000);
        dropdown.dataset.currentStatus = newStatus; 
        fetchUsersWithReports(); 
    }
}


// =================================================================
// --- Broadcast Module (Kept from previous state) ---
// =================================================================

// --- UPDATED handleBroadcast FUNCTION ---
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

    try {
        // ✅ Call your deployed Edge Function
        const res = await fetch('https://ayptiehjxxincwsbtysl.supabase.co/functions/v1/send-push-broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: 'CRITICAL ALERT',
                message: message
            })
        });

        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to send broadcast');

        console.log('Broadcast results:', result);
        showMessage('Broadcast sent successfully!', 'success', 4000);
        form.reset();
    } catch (err) {
        console.error('Broadcast failed:', err);
        showMessage('Broadcast failed: ' + err.message, 'error', 7000);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Broadcast';
    }
}



// =================================================================
// --- Initialization (Keep as is) ---
// =================================================================

document.addEventListener('DOMContentLoaded', () => {
    
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
        
        fetchUsersWithReports(); 

        document.querySelectorAll('.navbar a').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = e.target.dataset.target;

                if (e.target.id === 'navLogout') {
                    handleLogout();
                    return;
                }

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

        const refreshBtn = document.getElementById('refreshReportsBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', fetchUsersWithReports);
        }

        const backBtn = document.getElementById('backToUsersBtn');
        if (backBtn) {
            backBtn.addEventListener('click', handleBack);
        }

        const broadcastForm = document.getElementById('broadcastForm');
        if (broadcastForm) {
            broadcastForm.addEventListener('submit', handleBroadcast);
        }
    }
});