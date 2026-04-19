const API_BASE_URL = 'http://127.0.0.1:5000';

// DOM Elements
const form = document.getElementById('forecast-form');
const categorySelect = document.getElementById('category');
const productSelect = document.getElementById('product');
const dateInput = document.getElementById('date');
const locationInput = document.getElementById('location');

const submitBtn = document.getElementById('submit-btn');
const btnText = document.querySelector('.btn-text');
const loader = document.querySelector('.loader');
const errorContainer = document.getElementById('error-message');
const errorText = document.getElementById('error-text');

const emptyState = document.getElementById('empty-state');
const dashboardContent = document.getElementById('dashboard-content');

const predictedDemandEl = document.getElementById('predicted-demand');
const recommendedStockEl = document.getElementById('recommended-stock');
const weatherStatusEl = document.getElementById('weather-status');
const weatherIconEl = document.getElementById('weather-icon');
const insightsList = document.getElementById('insights-list');

const themeToggleBtn = document.getElementById('theme-toggle');
const exportBtn = document.getElementById('export-btn');

// Chart instances
let trendChart = null;
let comparisonChart = null;

// Ensure Chart.js uses suitable defaults for theming
Chart.defaults.color = '#94a3b8';
Chart.defaults.font.family = "'Inter', sans-serif";

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    const today = new Date();
    dateInput.valueAsDate = today;
    
    // Calculate calendar 7-day limits
    const minDate = today.toISOString().split('T')[0];
    const maxDateObj = new Date();
    maxDateObj.setDate(today.getDate() + 7);
    const maxDate = maxDateObj.toISOString().split('T')[0];
    
    dateInput.setAttribute('min', minDate);
    dateInput.setAttribute('max', maxDate);

    fetchCategories();
    initTheme();
});

// Theme Management
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
        themeToggleBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
        updateChartThemes(true);
    }
}

themeToggleBtn.addEventListener('click', () => {
    const isLight = document.body.classList.toggle('light-theme');
    document.body.classList.toggle('dark-theme', !isLight);
    
    themeToggleBtn.innerHTML = isLight ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    updateChartThemes(isLight);
});

// PDF Export Feature
exportBtn.addEventListener('click', () => {
    if (dashboardContent.classList.contains('hidden')) {
        alert("Please run a prediction first to generate a report.");
        return;
    }
    
    const element = document.querySelector('.dashboard-container');
    const opt = {
        margin: 10,
        filename: `Forecast_Report_${dateInput.value}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
    };

    // Temporarily hide the empty state and adjust styles for print if necessary
    const originalBg = document.body.style.backgroundColor;
    document.body.style.backgroundColor = '#ffffff'; // force white bg for pdf
    if(!document.body.classList.contains('light-theme')){
        document.body.classList.add('light-theme');
        updateChartThemes(true);
    }

    html2pdf().set(opt).from(element).save().then(() => {
        // revert theme
        document.body.style.backgroundColor = originalBg;
        if(localStorage.getItem('theme') !== 'light'){
            document.body.classList.remove('light-theme');
            updateChartThemes(false);
        }
    });
});


// API Interactions
async function fetchCategories() {
    try {
        const response = await fetch(`${API_BASE_URL}/categories`);
        if (!response.ok) throw new Error('Failed to load categories');
        
        const data = await response.json();
        data.categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            categorySelect.appendChild(option);
        });
    } catch (err) {
        showError('Cannot connect to forecasting engine.');
        console.error(err);
    }
}

categorySelect.addEventListener('change', async (e) => {
    const category = e.target.value;
    productSelect.innerHTML = '<option value="" disabled selected>Loading...</option>';
    productSelect.disabled = true;
    
    try {
        const response = await fetch(`${API_BASE_URL}/products?category=${encodeURIComponent(category)}`);
        if (!response.ok) throw new Error('Failed to load products');
        
        const data = await response.json();
        productSelect.innerHTML = '<option value="" disabled selected>Select a product</option>';
        data.products.forEach(prod => {
            const option = document.createElement('option');
            option.value = prod;
            option.textContent = prod;
            productSelect.appendChild(option);
        });
        productSelect.disabled = false;
    } catch (err) {
        showError('Failed to load products.');
        productSelect.innerHTML = '<option value="" disabled selected>Error loading</option>';
    }
});

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();
    
    const category = categorySelect.value;
    const product = productSelect.value;
    const date = dateInput.value;
    const location = locationInput.value;
    
    if (!category || !product || !date || !location) {
        showError('Please fill in all fields correctly.');
        return;
    }

    setLoading(true);
    
    try {
        const response = await fetch(`${API_BASE_URL}/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category, product, date, location })
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Prediction engine error');
        
        // Fetch real history from CSV
        const histResponse = await fetch(`${API_BASE_URL}/history?product=${encodeURIComponent(product)}`);
        const histData = await histResponse.json();
        
        processPrediction(data.predicted_demand, data.weather_condition, date, product, location, histData.history || []);
        
    } catch (err) {
        showError(err.message);
    } finally {
        setLoading(false);
    }
});

// UI State Management
function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    if (isLoading) {
        btnText.classList.add('hidden');
        loader.classList.remove('hidden');
    } else {
        btnText.classList.remove('hidden');
        loader.classList.add('hidden');
    }
}

function showError(msg) {
    errorText.textContent = msg;
    errorContainer.classList.remove('hidden');
}

function hideError() {
    errorContainer.classList.add('hidden');
}

// Data Processing & Dashboard Update
function processPrediction(demand, weather, dateStr, product, location, history) {
    // Hide empty state, show dashboard
    emptyState.classList.add('hidden');
    dashboardContent.classList.remove('hidden');

    const demandVal = Math.round(demand);
    
    // Calculate stock recommendation logic (15% to 20% buffer)
    const pseudoBuffer = 0.15 + (Math.abs(Math.sin(demandVal + product.length)) * 0.05); // pseudo-random deterministic buffer 15-20%
    const recommendedStock = Math.ceil(demandVal * (1 + pseudoBuffer));
    
    // Update Number Displays with Animation
    animateValue(predictedDemandEl, parseInt(predictedDemandEl.textContent) || 0, demandVal, 1500);
    setTimeout(() => {
        animateValue(recommendedStockEl, parseInt(recommendedStockEl.textContent) || 0, recommendedStock, 1500);
    }, 300); // Stagger animation

    // Update Weather Badge
    updateWeatherBadge(weather);

    // Generate Insights
    generateInsights(demandVal, recommendedStock, weather, product, location);

    // Update Charts
    updateCharts(demandVal, dateStr, product, history);
}

function updateWeatherBadge(weather) {
    weatherStatusEl.textContent = weather;
    let icon = 'fa-cloud-sun';
    
    switch(weather) {
        case 'Sunny': icon = 'fa-sun'; break;
        case 'Cloudy': icon = 'fa-cloud'; break;
        case 'Rainy': icon = 'fa-cloud-showers-heavy'; break;
        case 'Storm': icon = 'fa-cloud-bolt'; break;
        case 'Heatwave': icon = 'fa-temperature-high'; break;
    }
    
    weatherIconEl.innerHTML = `<i class="fa-solid ${icon}"></i>`;
}

function generateInsights(demand, stock, weather, product, location) {
    insightsList.innerHTML = ''; // clear existing
    
    const addInsight = (type, icon, text) => {
        const li = document.createElement('li');
        li.className = `insight-item ${type}`;
        li.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${text}</span>`;
        insightsList.appendChild(li);
    };

    // Location/Weather contextualization
    addInsight('info', 'fa-location-dot', `Analyzed using accurate external meteorological data forecasted for ${location}.`);

    // Demand context
    if(demand > 40) {
        addInsight('positive', 'fa-arrow-trend-up', `High demand expected for ${product}. Consider early stock replenishment.`);
    } else {
        addInsight('info', 'fa-arrow-trend-down', `Standard demand trajectory predicted for the selected date.`);
    }

    // Weather impact
    if (weather === 'Heatwave' || weather === 'Sunny') {
        addInsight('warning', 'fa-sun', `Sunny or Heatwave conditions detected locally, which may increase store traffic and particular demand.`);
    } else if (weather === 'Storm' || weather === 'Rainy') {
        addInsight('warning', 'fa-cloud-rain', `Inclement weather detected locally. Predicting shifts in category interest and footfall.`);
    }

    // Stock advice
    addInsight('positive', 'fa-boxes-stacked', `Recommended stock level: ${stock} units. Provides a safe ${Math.round(((stock/demand)-1)*100)}% buffer.`);
}

// Charting Logic
function updateCharts(predictedDemand, dateStr, product, history) {
    const isLight = document.body.classList.contains('light-theme');
    const textColor = isLight ? '#475569' : '#94a3b8';
    const gridColor = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';

    // 1. Trend Chart (Using real history + prediction)
    const trendCtx = document.getElementById('trendChart').getContext('2d');
    
    const labels = history.map(h => {
        const d = new Date(h.date);
        return d.toLocaleDateString('en-US', {month:'short', day:'numeric', year: '2-digit'});
    });
    
    // Add current prediction label
    const predDate = new Date(dateStr);
    labels.push(`${predDate.toLocaleDateString('en-US', {month:'short', day:'numeric'})} (FC)`);
    
    const chartData = history.map(h => h.demand);
    chartData.push(predictedDemand);

    // Colors
    const primaryColor = '#6366f1';
    
    if(trendChart) trendChart.destroy();
    
    trendChart = new Chart(trendCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Units Sold',
                data: chartData,
                borderColor: primaryColor,
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: [...Array(history.length).fill(primaryColor), '#ec4899'], // Highlight predicted point
                pointRadius: [...Array(history.length).fill(4), 8],
                pointHoverRadius: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ctx.dataIndex === chartData.length - 1 ? `Predicted: ${ctx.raw}` : `Actual: ${ctx.raw}`
                    }
                }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor } },
                x: { grid: { display: false }, ticks: { color: textColor } }
            }
        }
    });

    // 2. Comparison Chart
    const compCtx = document.getElementById('comparisonChart').getContext('2d');
    
    // Real average from history
    const avgDemand = history.length > 0 
        ? Math.round(history.reduce((a, b) => a + b.demand, 0) / history.length)
        : 0;
    
    if(comparisonChart) comparisonChart.destroy();
    
    comparisonChart = new Chart(compCtx, {
        type: 'bar',
        data: {
            labels: ['30-Day Avg', 'Predicted Date'],
            datasets: [{
                label: 'Units',
                data: [avgDemand, predictedDemand],
                backgroundColor: [
                    isLight ? '#cbd5e1' : 'rgba(148, 163, 184, 0.3)', 
                    predictedDemand > avgDemand ? '#10b981' : '#f59e0b'
                ],
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor } },
                x: { grid: { display: false }, ticks: { color: textColor } }
            }
        }
    });
}

function updateChartThemes(isLight) {
    if(!trendChart || !comparisonChart) return;
    
    const textColor = isLight ? '#475569' : '#94a3b8';
    const gridColor = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
    
    const updateScale = (chart) => {
        chart.options.scales.x.ticks.color = textColor;
        chart.options.scales.y.ticks.color = textColor;
        chart.options.scales.y.grid.color = gridColor;
        chart.update();
    };
    
    updateScale(trendChart);
    updateScale(comparisonChart);
}

// Utility Animation
function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 4);
        obj.innerHTML = Math.round(start + (end - start) * easeProgress);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}