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
// --- Reports Dashboard Module (Updated) ---
// =================================================================

function renderReports(reports) {
    const grid = document.getElementById('reportsGrid');
    if (!grid) return;

    if (!reports || reports.length === 0) {
        grid.innerHTML = '<p class="text-center" style="grid-column: 1 / -1;">No current emergency reports found.</p>';
        return;
    }

    grid.innerHTML = reports.map(report => {
        const date = new Date(report.timestamp).toLocaleString();
        const photoLink = report.photo_url 
            ? getPublicPhotoUrl(report.photo_url)
            : null;
        
        // Correct Google Maps link syntax
        const mapUrl = `http://maps.google.com/maps?q=${report.latitude},${report.longitude}`;
        
        // Extract Profile Data (Nested object from the join)
        const profile = report.profiles || {}; 
        
        return `
            <div class="report-card">
                <div>
                    <h4>${report.incident_type || 'Unknown Incident'} 
                        <span class="status-tag ${report.status}">${report.status}</span>
                    </h4>
                    
                    <p><strong>Time:</strong> ${date}</p>
                    <p><strong>Location:</strong> <a href="${mapUrl}" target="_blank" class="text-link">View Map (${report.latitude}, ${report.longitude})</a></p>
                    <p><strong>Severity:</strong> ${report.severity_level || 'Low'}</p>
                    <p><strong>Details:</strong> ${report.incident_details || 'N/A'}</p>
                    ${photoLink ? `<p><strong>Photo:</strong> <a href="${photoLink}" target="_blank" class="text-link">View Image</a></p>` : ''}
                    
                    <hr style="margin: 10px 0; border: 0; border-top: 1px solid #e0e0e0;">
                    
                    <h5 style="margin-bottom: 5px; color: #1976d2;">User Profile:</h5>
                    <p><strong>Name:</strong> ${profile.fullname || 'N/A'}</p>
                    <p><strong>Email:</strong> ${profile.email || 'N/A'}</p>
                    <p><strong>Phone:</strong> ${profile.phone || 'N/A'}</p>
                    <p><strong>Address:</strong> ${profile.address ? `${profile.address}, ${profile.city} - ${profile.pincode}` : 'N/A'}</p>
                    <p><strong>Medical:</strong> ${profile.medical || 'None specified'}</p>
                    <p><strong>Emergency 1:</strong> ${profile.emergency1 || 'N/A'}</p>
                </div>
                
                <div class="report-footer">
                    <select class="status-dropdown" data-report-id="${report.id}" data-current-status="${report.status}">
                        <option value="Reported" ${report.status === 'Reported' ? 'selected' : ''}>Reported</option>
                        <option value="Assigned" ${report.status === 'Assigned' ? 'selected' : ''}>Assigned</option>
                        <option value="Resolved" ${report.status === 'Resolved' ? 'selected' : ''}>Resolved</option>
                    </select>
                </div>
            </div>
        `;
    }).join('');

    // Attach listener to dropdowns
    document.querySelectorAll('.status-dropdown').forEach(dropdown => {
        dropdown.addEventListener('change', handleStatusUpdate);
    });
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


async function fetchReports() {
    const grid = document.getElementById('reportsGrid');
    if (!grid) return;

    grid.innerHTML = '<div class="text-center" style="grid-column: 1 / -1; padding: 50px;"><i class="fas fa-spinner fa-spin" style="font-size: 24px; color: var(--primary-color);"></i><p>Loading reports...</p></div>';

    // Use '*, profiles(*)' to fetch report details AND join the associated user profile data
    const { data, error } = await supabase
        .from('emergency_reports')
        .select('*, profiles(*)') 
        .order('timestamp', { ascending: false });

    if (error) {
        console.error('Error fetching reports:', error);
        showMessage('Error fetching reports: ' + error.message + '. Please check the RLS policy for emergency_reports.', 'error', 7000);
        grid.innerHTML = '<p class="text-center" style="grid-column: 1 / -1;">Failed to load reports. **Action Required: Check RLS policy.**</p>';
        return;
    }

    renderReports(data);
}

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
        .eq('id', reportId);

    dropdown.disabled = false;

    if (error) {
        console.error('Status update failed:', error);
        showMessage('Failed to update status: ' + error.message + '. Check the RLS policy for updates.', 'error', 5000);
        dropdown.value = oldStatus; // Revert selection
    } else {
        showMessage(`Report ${reportId} status successfully set to ${newStatus}.`, 'success', 3000);
        dropdown.dataset.currentStatus = newStatus; // Update stored status
        // Refresh the list to reflect changes in UI
        fetchReports();
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
        fetchReports(); 

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

        // 3. Report Refresh Button
        const refreshBtn = document.getElementById('refreshReportsBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', fetchReports);
        }

        // 4. Broadcast Form Submission
        const broadcastForm = document.getElementById('broadcastForm');
        if (broadcastForm) {
            broadcastForm.addEventListener('submit', handleBroadcast);
        }
    }
});