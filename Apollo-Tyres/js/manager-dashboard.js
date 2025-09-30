document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('authToken');
    if (!token) {
        document.getElementById('errorMessage').textContent = 'Not authenticated';
        return;
    }

    // Fetch users and projects for KPIs and table
    fetch('/api/manager/users', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
        .then(res => {
            if (!res.ok) {
                if (res.status === 401 || res.status === 403) {
                    localStorage.removeItem('authToken');
                    window.location.href = '/login.html';
                    throw new Error('Authentication failed');
                }
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            return res.json();
        })
        .then(data => {
            console.log('Received users data:', data);
            if (!data.success) {
                throw new Error(data.message || 'Failed to load data');
            }
            // KPIs
            document.getElementById('totalEngineers').textContent = data.users.length;

            // Calculate total projects
            let totalProjects = data.users.reduce((sum, user) => {
                console.log(`User ${user.email} has ${user.project_count} projects`);
                return sum + (parseInt(user.project_count) || 0);
            }, 0);

            document.getElementById('totalProjects').textContent = totalProjects;
            // Active Engineers (last 7 days)
            const now = new Date();
            let activeCount = data.users.filter(user => user.last_login && (now - new Date(user.last_login)) < 7 * 24 * 60 * 60 * 1000).length;
            document.getElementById('activeEngineers').textContent = activeCount;

            // Render table
            renderUsersTable(data.users);

            // Search/filter
            document.getElementById('searchInput').addEventListener('input', function () {
                filterAndRender(data.users);
            });
            document.getElementById('activityFilter').addEventListener('change', function () {
                filterAndRender(data.users);
            });
        })
        .catch(error => {
            console.error('Error:', error);
            document.getElementById('errorMessage').textContent = error.message;
        });

    // Fetch notifications
    fetch('/api/manager/notifications', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
        .then(res => res.json())
        .then(data => {
            if (data.success && data.notifications && data.notifications.length > 0) {
                const area = document.getElementById('notificationsArea');
                area.style.display = '';
                area.innerHTML = data.notifications.map(n => `<div>${n}</div>`).join('');
            }
        });

    // Fetch recent activity
    fetch('/api/manager/recent-activity', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
        .then(res => res.json())
        .then(data => {
            if (data.success && data.activities) {
                const ul = document.getElementById('recentActivityList');
                ul.innerHTML = '';
                data.activities.forEach(act => {
                    const li = document.createElement('li');
                    li.textContent = act;
                    ul.appendChild(li);
                });
            }
        });

    // Add engineer form handler
    const addForm = document.getElementById('addEngineerForm');
    if (addForm) {
        addForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            const email = document.getElementById('newEngineerEmail').value.trim();
            const password = document.getElementById('newEngineerPassword').value;
            const errorDiv = document.getElementById('addUserError');
            errorDiv.textContent = '';

            const token = localStorage.getItem('authToken');
            if (!token) {
                errorDiv.textContent = 'Not authenticated.';
                return;
            }

            const base = window.location.origin;
            try {
                const res = await fetch(`${window.location.origin}/api/manager/add-user`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({ email, password })
                });
            console.log('add-user status:', res.status, 'content-type:', res.headers.get('content-type'));

                

                let data;
                const contentType = res.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    data = await res.json();
                } else {
                    throw new Error('Server returned non-JSON response');
                }

                if (res.ok && data.success) {
                    addForm.reset();
                    errorDiv.style.color = 'green';                    
                    errorDiv.textContent = 'Engineer added successfully!';
                    loadEngineers();
                } else {
                    errorDiv.style.color = 'red';
                    errorDiv.textContent = data.message || 'Error adding engineer.';
                }
            } catch (err) {
                errorDiv.textContent = err.message || 'Error adding user.';
            }
        });
    }

    // Function to load engineers
    async function loadEngineers() {
        const token = localStorage.getItem('authToken');
        const tbody = document.querySelector('#usersTable tbody');
        const errorDiv = document.getElementById('errorMessage');
        if (!token) {
            errorDiv.textContent = 'Not authenticated.';
            return;
        }
        try {
            const res = await fetch('/api/manager/users', {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            const data = await res.json();
            if (data.success && Array.isArray(data.users)) {
                tbody.innerHTML = '';
                data.users.forEach(user => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${user.email}</td>
                        <td>${user.role}</td>
                        <td>${user.created_at ? new Date(user.created_at).toLocaleString() : ''}</td>
                        <td>${user.last_login ? new Date(user.last_login).toLocaleString() : ''}</td>
                        <td>${user.project_count || 0}</td>
                    `;
                    tbody.appendChild(tr);
                });
                errorDiv.textContent = '';
            } else {
                errorDiv.textContent = data.message || 'Failed to load users.';
            }
        } catch (err) {
            errorDiv.textContent = 'Error loading users.';
        }
    }

    // Filtering function
    function filterAndRender(users) {
        const search = document.getElementById('searchInput').value.toLowerCase();
        const activity = document.getElementById('activityFilter').value;
        const now = new Date();
        let filtered = users.filter(user => user.email.toLowerCase().includes(search));
        if (activity === 'active') {
            filtered = filtered.filter(user => user.last_login && (now - new Date(user.last_login)) < 7 * 24 * 60 * 60 * 1000);
        } else if (activity === 'inactive') {
            filtered = filtered.filter(user => !user.last_login || (now - new Date(user.last_login)) >= 7 * 24 * 60 * 60 * 1000);
        }
        renderUsersTable(filtered);
    }

    // Table rendering
    function renderUsersTable(users) {
        const tbody = document.querySelector('#usersTable tbody');
        tbody.innerHTML = '';
        users.forEach(user => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${user.email}</td>
                <td>${user.role}</td>
                <td>${new Date(user.created_at).toLocaleString()}</td>
                <td>${user.last_login ? new Date(user.last_login).toLocaleString() : '-'}</td>
                <td>${user.project_count !== undefined ? user.project_count : '-'}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Initial load
    loadEngineers();
});