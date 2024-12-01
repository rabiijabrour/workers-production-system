// المتغيرات العامة
let workers = [];
let productions = [];
let token = localStorage.getItem('token');
const API_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';

// التحقق من تسجيل الدخول
function checkAuth() {
    if (!token) {
        window.location.href = '/login.html';
    }
}

// دوال API
async function fetchWorkers() {
    const response = await fetch(`${API_URL}/api/workers`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    if (response.status === 401) {
        window.location.href = '/login.html';
        return;
    }
    workers = await response.json();
    updateWorkersTable();
    updateProductionWorkerSelect();
}

async function fetchProductions() {
    const response = await fetch(`${API_URL}/api/productions`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    if (response.status === 401) {
        window.location.href = '/login.html';
        return;
    }
    productions = await response.json();
    updateProductionTable();
}

async function fetchSummary() {
    const response = await fetch(`${API_URL}/api/summary`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    if (response.status === 401) {
        window.location.href = '/login.html';
        return;
    }
    const summary = await response.json();
    updateSummaryTable(summary);
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
        
        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }
        
        if (!response.ok) throw new Error('Failed to add worker');
        
        this.reset();
        await fetchWorkers();
    } catch (error) {
        alert('حدث خطأ أثناء إضافة العامل');
        console.error(error);
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
            
            if (response.status === 401) {
                window.location.href = '/login.html';
                return;
            }
            
            if (!response.ok) throw new Error('Failed to delete worker');
            
            await fetchWorkers();
            await fetchProductions();
            await fetchSummary();
        } catch (error) {
            alert('حدث خطأ أثناء حذف العامل');
            console.error(error);
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
        
        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }
        
        if (!response.ok) throw new Error('Failed to record production');
        
        this.reset();
        await fetchProductions();
        await fetchSummary();
    } catch (error) {
        alert('حدث خطأ أثناء تسجيل الإنتاج');
        console.error(error);
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

// تحديث البيانات عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', async function() {
    checkAuth();
    await fetchWorkers();
    await fetchProductions();
    await fetchSummary();
    setupProductionReminder();
});
