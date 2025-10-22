// --- Supabase SDK Imports ---
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.44.3/+esm';

// =================================================================
// YOUR SUPABASE CONFIGURATION 
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

// DOM Elements
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
 * Generates the URL for a Google Static Map image.
 * NOTE: The user must provide a valid Google Maps API Key for this image to load properly in production.
 * This implementation omits the key for security, which will result in a 'placeholder' image if no key is used.
 */
function getStaticMapUrl(lat, lng) {
    const base = 'https://maps.googleapis.com/maps/api/staticmap?';
    const params = new URLSearchParams({
        center: `${lat},${lng}`,
        zoom: 14,
        size: '450x200',
        maptype: 'roadmap',
        markers: `color:red%7C${lat},${lng}`,
        // Add &key=YOUR_API_KEY_HERE for it to work properly. Omitting key for security.
    });
    return base + params.toString();
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
// --- Reports Dashboard Module ---
// =================================================================

// Helper to switch between dashboard stages
function switchStage(target) {
    const stages = [userListEl(), reportListEl(), reportDetailEl()];
    stages.forEach(el => {
        el.classList.add('hidden');
    });

    if (target === 'users') {
        userListEl().classList.remove('hidden');
        backButtonEl().classList.add('hidden');
        titleEl().textContent = 'User Reports Overview';
        subtitleEl().textContent = `Monitor and update the status of incoming emergency reports in real-time.`;
    } else if (target === 'reports') {
        reportListEl().classList.remove('hidden');
        backButtonEl().classList.remove('hidden');
    } else if (target === 'detail') {
        reportDetailEl().classList.remove('hidden');
        backButtonEl().classList.remove('hidden');
    }
    CURRENT_VIEW = target;
}


// --- Stage 1: Fetch and Render Unique Users ---

async function fetchUsersWithReports() {
    switchStage('users');
    // Show loading state
    userListEl().innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> Loading user reports...</div>';
    
    // Fetch all reports and join profile data, sorted by timestamp (most recent first)
    const { data, error } = await supabase
        .from('emergency_reports')
        .select('*, profiles(*)') 
        .order('timestamp', { ascending: false }); 

    if (error) {
        console.error('Error fetching reports:', error);
        showMessage('Error fetching reports: ' + (error.message || 'Check network connection or RLS policy.'), 'error', 7000);
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
    switchStage('users');
    subtitleEl().textContent = `Displaying reports from ${UNIQUE_USERS.length} unique users, newest first.`;


    if (UNIQUE_USERS.length === 0) {
        userListEl().innerHTML = '<p class="text-center">No current emergency reports found.</p>';
        return;
    }

    userListEl().innerHTML = `<div class="user-list-grid">` + UNIQUE_USERS.map(userEntry => {
        const profile = userEntry.profile;
        const fullName = profile.fullname || `User ID: ${userEntry.reports[0].user_id.substring(0, 8)}...`;
        const email = profile.email || 'N/A';
        const lastReportDate = new Date(userEntry.lastReportTime).toLocaleString();
        const firstReport = userEntry.reports[0];

        return `
            <div class="user-card" data-user-id="${firstReport.user_id}" data-user-name="${fullName}">
                <div class="user-card-content">
                    <i class="fas fa-user-circle"></i>
                    <div>
                        <h3>${fullName}</h3>
                        <p>Email: ${email}</p>
                        <p>Reports: <strong>${userEntry.reportCount}</strong> | Last: ${lastReportDate}</p>
                    </div>
                </div>
                <i class="fas fa-chevron-right"></i>
            </div>
        `;
    }).join('') + `</div>`;

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
    switchStage('reports');

    const userReports = ALL_REPORTS
        .filter(report => report.user_id === userId)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()); 

    if (userReports.length === 0) {
        renderUserList();
        return; 
    }

    titleEl().textContent = `Reports by ${userName}`;
    subtitleEl().textContent = `Viewing ${userReports.length} reports submitted by this user (newest first).`;

    reportListEl().innerHTML = userReports.map(report => {
        const date = new Date(report.timestamp).toLocaleString();
        const mapUrl = `https://www.google.com/maps/search/?api=1&query=${report.latitude},${report.longitude}`; // Still keeping the generic map link for the item
        
        return `
            <div class="report-list-item" data-report-id="${report.id}">
                <div class="report-list-content">
                    <div class="report-item-header">
                        <h4>${report.incident_type || 'Unknown Incident'}</h4>
                        <span class="status-tag ${report.status}">${report.status}</span>
                    </div>
                    <p><strong>Severity:</strong> <span class="severity-tag severity-${report.severity_level || 'Minor'}">${report.severity_level || 'N/A'}</span></p>
                    <p><strong>Time:</strong> ${date}</p>
                    <p><strong>Location:</strong> <a href="${mapUrl}" target="_blank" class="text-link">Map Link</a></p>
                </div>
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

// --- Stage 3: Render Report and Profile Details (70:30 Split) ---

function renderReportDetail(reportId) {
    switchStage('detail');

    const report = ALL_REPORTS.find(r => r.id === reportId);
    if (!report) return;

    const profile = report.profiles || {};
    const photoLink = report.photo_url ? getPublicPhotoUrl(report.photo_url) : null;
    const mapStaticUrl = getStaticMapUrl(report.latitude, report.longitude);
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${report.latitude},${report.longitude}`;
    const date = new Date(report.timestamp).toLocaleString();

    titleEl().textContent = `Report Detail: ${report.incident_type}`;
    subtitleEl().textContent = `Submitted by: ${profile.fullname || 'Unknown User'} at ${date}`;
    
    // --- Status Update Section (Placed at Top) ---
    const statusUpdateHTML = `
        <div class="status-update-section">
            <label>Update Status:</label>
            <select class="status-dropdown" data-report-id="${report.id}" data-current-status="${report.status}">
                <option value="Reported" ${report.status === 'Reported' ? 'selected' : ''}>Reported</option>
                <option value="Assigned" ${report.status === 'Assigned' ? 'selected' : ''}>Assigned</option>
                <option value="Resolved" ${report.status === 'Resolved' ? 'selected' : ''}>Resolved</option>
            </select>
            <span class="status-tag ${report.status}">${report.status}</span>
        </div>
    `;


    // 1. Report Detail Card (70%)
    const reportCardHTML = `
        <div class="detail-card report-details-card">
            <h3><i class="fas fa-file-alt"></i> Incident Details</h3>
            <p><strong>Severity:</strong> <span class="severity-tag severity-${(report.severity_level || 'Minor')}">${report.severity_level || 'N/A'}</span></p>
            <p><strong>Details:</strong> ${report.incident_details || 'No additional details provided.'}</p>
            
            <hr>
            <h4><i class="fas fa-map-marker-alt"></i> Location & Image</h4>

            <div class="location-section">
                <p><strong>Coordinates:</strong> ${report.latitude}, ${report.longitude}</p>
                <div class="embedded-map" onclick="window.open('${mapUrl}', '_blank');">
                    <img src="${mapStaticUrl}" alt="Map location preview" onerror="this.onerror=null;this.src='https://placehold.co/450x200/cccccc/333333?text=Map+Placeholder+-+Add+API+Key';">
                    <span class="map-overlay"><i class="fas fa-external-link-alt"></i> Click image to open in Google Maps</span>
                </div>
            </div>

            ${photoLink ? `
                <div class="image-section">
                    <p><strong>Attached Photo:</strong></p>
                    <a href="${photoLink}" target="_blank">
                        <img src="${photoLink}" alt="Attached Emergency Photo" class="report-image" onerror="this.onerror=null;this.src='https://placehold.co/250x150/ff4d4d/ffffff?text=Image+Load+Failed'">
                    </a>
                </div>
            ` : '<div class="image-section"><p>No photo attached to this report.</p></div>'}
        </div>
    `;

    // 2. Profile Details Card (30%)
    const profileCardHTML = `
        <div class="detail-card profile-details-card">
            <h3><i class="fas fa-user"></i> User Profile</h3>
            <p><strong>Name:</strong> ${profile.fullname || 'N/A'}</p>
            <p><strong>Email:</strong> ${profile.email || 'N/A'}</p>
            <p><strong>Phone:</strong> ${profile.phone || 'N/A'}</p>
            <p><strong>Address:</strong> ${profile.address ? `${profile.address}, ${profile.city} - ${profile.pincode}` : 'N/A'}</p>

            <h4><i class="fas fa-suitcase-medical"></i> Medical Info</h4>
            <p><strong>Blood Group:</strong> ${profile.bloodgrp || 'N/A'}</p>
            <p><strong>Medical Details:</strong> ${profile.medical || 'None specified'}</p>

            <h4><i class="fas fa-phone-volume"></i> Emergency Contacts</h4>
            <p><strong>Contact 1:</strong> ${profile.emergency1 || 'N/A'}</p>
            <p><strong>Contact 2:</strong> ${profile.emergency2 || 'N/A'}</p>
        </div>
    `;

    // Combine into final detail view
    reportDetailEl().innerHTML = `
        ${statusUpdateHTML}
        <div class="report-profile-grid">
            ${reportCardHTML}
            ${profileCardHTML}
        </div>
    `;

    // Attach listener to the new dropdown
    const dropdown = reportDetailEl().querySelector('.status-dropdown');
    if (dropdown) {
        dropdown.addEventListener('change', handleStatusUpdate);
    }
}


// --- Status Update Handler ---

async function handleStatusUpdate(e) {
    const dropdown = e.target;
    const reportId = dropdown.dataset.reportId;
    const newStatus = dropdown.value;
    const oldStatus = dropdown.dataset.currentStatus;

    if (newStatus === oldStatus) return;

    dropdown.disabled = true;
    showMessage(`Updating status of Report ID ${reportId} to ${newStatus}...`, 'info', 2000);

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
        showMessage(`Report ${reportId} status successfully set to ${newStatus}.`, 'success', 3000);
        
        // Update the report in the global list
        const updatedReportIndex = ALL_REPORTS.findIndex(r => r.id === reportId);
        if (updatedReportIndex !== -1) {
             ALL_REPORTS[updatedReportIndex].status = newStatus;
        }

        // Re-render the current view to reflect the new status badge/list
        if (CURRENT_VIEW === 'detail') {
             renderReportDetail(reportId);
        } else if (CURRENT_VIEW === 'reports') {
            const currentUserId = ALL_REPORTS[updatedReportIndex].user_id;
            const currentUserName = ALL_REPORTS[updatedReportIndex].profiles.fullname || 'Unknown User';
            renderUserReports(currentUserId, currentUserName);
        }
    }
}


// --- Navigation and Back Button Logic ---

function setupNavigation() {
    const backButton = backButtonEl();
    backButton.addEventListener('click', () => {
        if (CURRENT_VIEW === 'detail') {
            // Get the user ID of the current report to go back to the user's report list
            const currentReport = ALL_REPORTS.find(r => r.id === reportDetailEl().querySelector('.status-dropdown').dataset.reportId);
            if (currentReport) {
                renderUserReports(currentReport.user_id, currentReport.profiles.fullname || 'Reports');
            } else {
                renderUserList();
            }
        } else if (CURRENT_VIEW === 'reports') {
            // Go back to the main user list
            renderUserList();
        }
    });

    // Initial fetch
    fetchUsersWithReports();
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
        
        // 1. Initial Content Loading & Navigation Setup
        setupNavigation(); 

        // 2. Tab Switching
        document.querySelectorAll('.navbar a').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = e.target.dataset.target;

                if (e.target.id === 'navLogout') {
                    handleLogout();
                    return;
                }

                // Handle Tab Switching for the main sections
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

        // 3. Report Refresh Button
        const refreshBtn = document.getElementById('refreshReportsBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', fetchUsersWithReports);
        }

        // 4. Broadcast Form Submission
        const broadcastForm = document.getElementById('broadcastForm');
        if (broadcastForm) {
            broadcastForm.addEventListener('submit', handleBroadcast);
        }
    }
});