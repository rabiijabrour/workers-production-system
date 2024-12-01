// المتغيرات العامة
let workers = [];
let productions = [];
let token = localStorage.getItem('token');
const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://workers-production-system.onrender.com';

// التحقق من تسجيل الدخول
function checkAuth() {
    if (!token) {
        window.location.href = '/login.html';
    }
}

// معالجة الأخطاء العامة
async function handleApiError(response) {
    if (!response.ok) {
        if (response.status === 401) {
            localStorage.removeItem('token');
            window.location.href = '/login.html';
            return;
        }
        const error = await response.json();
        throw new Error(error.error || 'حدث خطأ في النظام');
    }
    return response.json();
}

// دوال API
async function fetchWorkers() {
    try {
        const response = await fetch(`${API_URL}/api/workers`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        workers = await handleApiError(response);
        updateWorkersTable();
        updateProductionWorkerSelect();
    } catch (error) {
        showError(error.message);
    }
}

async function fetchProductions() {
    try {
        const response = await fetch(`${API_URL}/api/productions`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        productions = await handleApiError(response);
        updateProductionTable();
    } catch (error) {
        showError(error.message);
    }
}

async function fetchSummary() {
    try {
        const response = await fetch(`${API_URL}/api/summary`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const summary = await handleApiError(response);
        updateSummaryTable(summary);
    } catch (error) {
        showError(error.message);
    }
}

// إدارة العمال
document.getElementById('workerForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const name = document.getElementById('workerName').value;
    const id = document.getElementById('workerId').value;
    const department = document.getElementById('department').value;
    
    try {
        const response = await fetch(`${API_URL}/api/workers`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ id, name, department })
        });
        
        await handleApiError(response);
        
        this.reset();
        await fetchWorkers();
    } catch (error) {
        showError(error.message);
    }
});

async function deleteWorker(workerId) {
    if (confirm('هل أنت متأكد من حذف هذا العامل؟')) {
        try {
            const response = await fetch(`${API_URL}/api/workers/${workerId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            await handleApiError(response);
            
            await fetchWorkers();
            await fetchProductions();
            await fetchSummary();
        } catch (error) {
            showError(error.message);
        }
    }
}

// تسجيل الإنتاج
document.getElementById('productionForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const workerId = document.getElementById('productionWorkerId').value;
    const pieces = parseInt(document.getElementById('pieces').value);
    
    try {
        const response = await fetch(`${API_URL}/api/productions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ workerId, pieces })
        });
        
        await handleApiError(response);
        
        this.reset();
        await fetchProductions();
        await fetchSummary();
    } catch (error) {
        showError(error.message);
    }
});

// تحديث الجداول
function updateWorkersTable() {
    const tbody = document.querySelector('#workersTable tbody');
    tbody.innerHTML = '';
    
    workers.forEach(worker => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${worker.id}</td>
            <td>${worker.name}</td>
            <td>${worker.department}</td>
            <td>
                <i class="bi bi-trash delete-btn" onclick="deleteWorker('${worker.id}')"></i>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updateProductionWorkerSelect() {
    const select = document.getElementById('productionWorkerId');
    select.innerHTML = '<option value="">اختر العامل...</option>';
    
    workers.forEach(worker => {
        const option = document.createElement('option');
        option.value = worker.id;
        option.textContent = `${worker.name} (${worker.department})`;
        select.appendChild(option);
    });
}

function updateProductionTable() {
    const tbody = document.querySelector('#productionTable tbody');
    tbody.innerHTML = '';
    
    productions.forEach(prod => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${new Date(prod.date).toLocaleDateString('ar-SA', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })}</td>
            <td>${prod.workerName}</td>
            <td>${prod.department}</td>
            <td>${prod.pieces}</td>
        `;
        tbody.appendChild(tr);
    });
}

function updateSummaryTable(summary) {
    const tbody = document.querySelector('#summaryTable tbody');
    tbody.innerHTML = '';
    
    summary.forEach(sum => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${sum.name}</td>
            <td>${sum.department}</td>
            <td>${sum.total || 0}</td>
            <td>${sum.average || 0}</td>
        `;
        tbody.appendChild(tr);
    });
}

// تحديث لوحة التحكم
async function updateDashboard() {
    try {
        const [workersResponse, productionResponse] = await Promise.all([
            fetch(`${API_URL}/api/workers`),
            fetch(`${API_URL}/api/production/summary`)
        ]);

        const workers = await handleApiError(workersResponse);
        const production = await handleApiError(productionResponse);

        // تحديث الإحصائيات
        document.getElementById('totalWorkers').textContent = workers.length;
        document.getElementById('todayProduction').textContent = production.todayTotal || 0;
        document.getElementById('avgProduction').textContent = production.average || 0;
        document.getElementById('bestProduction').textContent = production.best || 0;

        // رسم المخطط البياني للإنتاج
        const productionCtx = document.getElementById('productionChart').getContext('2d');
        new Chart(productionCtx, {
            type: 'line',
            data: {
                labels: production.dates,
                datasets: [{
                    label: 'الإنتاج اليومي',
                    data: production.values,
                    borderColor: '#3498db',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    title: {
                        display: true,
                        text: 'تحليل الإنتاج اليومي'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });

        // رسم المخطط الدائري لتوزيع العمال
        const departments = {};
        workers.forEach(worker => {
            departments[worker.department] = (departments[worker.department] || 0) + 1;
        });

        const departmentCtx = document.getElementById('departmentChart').getContext('2d');
        new Chart(departmentCtx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(departments),
                datasets: [{
                    data: Object.values(departments),
                    backgroundColor: [
                        '#2ecc71',
                        '#3498db',
                        '#9b59b6',
                        '#f1c40f'
                    ]
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    } catch (error) {
        console.error('خطأ في تحديث لوحة التحكم:', error);
        showError('حدث خطأ أثناء تحديث لوحة التحكم');
    }
}

// تحديث البيانات كل دقيقة
setInterval(updateDashboard, 60000);

// منبه تسجيل الإنتاج
function setupProductionReminder() {
    if (Notification.permission !== 'granted') {
        Notification.requestPermission();
    }
    
    setInterval(() => {
        if (Notification.permission === 'granted') {
            new Notification('تذكير بتسجيل الإنتاج', {
                body: 'حان وقت تسجيل الإنتاج للعمال',
                icon: 'notification-icon.png'
            });
        }
    }, 60 * 60 * 1000); // كل ساعة
}

// عرض رسائل الخطأ
function showError(message) {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-danger alert-dismissible fade show';
    alertDiv.role = 'alert';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.querySelector('.container').insertBefore(alertDiv, document.querySelector('.container').firstChild);
    setTimeout(() => alertDiv.remove(), 5000);
}

// تحديث البيانات عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', async function() {
    checkAuth();
    await fetchWorkers();
    await fetchProductions();
    await fetchSummary();
    updateDashboard();
    setupProductionReminder();
});
