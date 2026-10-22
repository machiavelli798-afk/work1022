// dashboard.js - 대시보드 통계 계산, 차트 시각화 및 인포그래픽 렌더링 모듈
(function () {
  'use strict';

  let currentData = [];
  let currentMeta = { baseYearLabel: '2026년', targetYearLabel: '2027년' };
  let activeField = 'ALL';
  let activeSubProjectId = null;
  let chartInstances = {};

  // 통화/숫자 포맷터
  function formatNumber(num) {
    if (num === undefined || num === null || isNaN(num)) return '0';
    return Number(num).toLocaleString();
  }

  // 핵심 키워드/숫자 자동 하이라이트 헬퍼
  function highlightText(text) {
    if (!text) return '<span class="text-muted">상세 내용이 없습니다.</span>';
    // 숫자, 퍼센트, 괄호 내용 강조
    return text
      .replace(/(\+\d[\d,]*(?:\.\d+)?(?:억원|억|조|만)?)/g, '<span class="highlight-badge plus">$1</span>')
      .replace(/(-\d[\d,]*(?:\.\d+)?(?:억원|억|조|만)?)/g, '<span class="highlight-badge minus">$1</span>')
      .replace(/(\d+(?:\.\d+)?%)/g, '<strong class="highlight-rate">$1</strong>')
      .replace(/(\([^)]+\))/g, '<span class="highlight-bracket">$1</span>');
  }

  // 1. 전체 KPI 계산
  function calculateKPIs(items) {
    const totalBase = items.reduce((sum, item) => sum + (item.baseYearVal || 0), 0);
    const totalTarget = items.reduce((sum, item) => sum + (item.targetYearVal || 0), 0);
    const totalDiff = totalTarget - totalBase;
    const totalRate = totalBase > 0 ? ((totalDiff / totalBase) * 100) : 0;
    
    // 고유 분야 추출
    const fields = Array.from(new Set(items.map(i => i.field))).filter(Boolean);

    return {
      totalBase,
      totalTarget,
      totalDiff,
      totalRate: Math.round(totalRate * 10) / 10,
      fieldCount: fields.length,
      projectCount: items.length
    };
  }

  // 2. 전체 상단 KPI 인포그래픽 렌더링
  function renderOverviewKPIs() {
    const kpis = calculateKPIs(currentData);
    const unit = currentData[0]?.unit || '억원';

    document.getElementById('kpi-total-target').textContent = `${formatNumber(kpis.totalTarget)} ${unit}`;
    document.getElementById('kpi-total-base').textContent = `${currentMeta.baseYearLabel}: ${formatNumber(kpis.totalBase)} ${unit}`;
    
    const diffEl = document.getElementById('kpi-total-diff');
    const isIncrease = kpis.totalDiff >= 0;
    diffEl.className = `kpi-diff ${isIncrease ? 'up' : 'down'}`;
    diffEl.innerHTML = `
      <i class="fa-solid fa-arrow-trend-${isIncrease ? 'up' : 'down'}"></i>
      <span>${isIncrease ? '+' : ''}${formatNumber(kpis.totalDiff)} ${unit} (${isIncrease ? '+' : ''}${kpis.totalRate}%)</span>
    `;

    document.getElementById('kpi-fields-count').textContent = `${kpis.fieldCount}개 분야`;
    document.getElementById('kpi-projects-count').textContent = `${kpis.projectCount}개 세부사업`;

    // 메타데이터 연도 라벨 갱신
    document.querySelectorAll('.label-base-year').forEach(el => el.textContent = currentMeta.baseYearLabel);
    document.querySelectorAll('.label-target-year').forEach(el => el.textContent = currentMeta.targetYearLabel);
  }

  // 3. 분야 선택 탭/필터 렌더링
  function renderFieldTabs() {
    const container = document.getElementById('field-chips-container');
    if (!container) return;

    const fields = Array.from(new Set(currentData.map(i => i.field))).filter(Boolean);
    
    let html = `
      <button class="chip-btn ${activeField === 'ALL' ? 'active' : ''}" data-field="ALL">
        <i class="fa-solid fa-layer-group"></i> 전체 보기 (${currentData.length})
      </button>
    `;

    fields.forEach(field => {
      const count = currentData.filter(i => i.field === field).length;
      html += `
        <button class="chip-btn ${activeField === field ? 'active' : ''}" data-field="${field}">
          ${field} <span class="chip-count">${count}</span>
        </button>
      `;
    });

    container.innerHTML = html;

    // 클릭 이벤트 바인딩
    container.querySelectorAll('.chip-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetBtn = e.currentTarget;
        activeField = targetBtn.dataset.field;
        // 분야 변경 시 활성화된 서브프로젝트는 해당 분야의 첫 번째 또는 null
        activeSubProjectId = null;
        updateDashboardView();
      });
    });
  }

  // 4. 분야별 집계 차트 (Overview 도넛 & 막대 차트)
  function renderOverviewCharts() {
    // 분야별 집계
    const fieldMap = {};
    currentData.forEach(item => {
      if (!fieldMap[item.field]) {
        fieldMap[item.field] = { base: 0, target: 0, diff: 0, count: 0 };
      }
      fieldMap[item.field].base += item.baseYearVal;
      fieldMap[item.field].target += item.targetYearVal;
      fieldMap[item.field].diff += item.diff;
      fieldMap[item.field].count += 1;
    });

    const labels = Object.keys(fieldMap);
    const targetValues = labels.map(f => fieldMap[f].target);
    const baseValues = labels.map(f => fieldMap[f].base);

    // 4-1. 분야별 예산 점유율 (도넛 차트)
    const donutCtx = document.getElementById('fieldDonutChart')?.getContext('2d');
    if (donutCtx) {
      if (chartInstances.donut) chartInstances.donut.destroy();
      chartInstances.donut = new Chart(donutCtx, {
        type: 'doughnut',
        data: {
          labels: labels.map(l => l.length > 15 ? l.substring(0, 15) + '...' : l),
          datasets: [{
            data: targetValues,
            backgroundColor: [
              '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#1d4ed8', '#0284c7', '#06b6d4', '#10b981'
            ],
            borderWidth: 2,
            borderColor: '#ffffff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11, family: "'Pretendard', sans-serif" } } },
            tooltip: {
              callbacks: {
                label: function (ctx) {
                  const val = ctx.raw;
                  const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                  const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                  return ` ${formatNumber(val)} (${pct}%)`;
                }
              }
            }
          },
          cutout: '68%'
        }
      });
    }

    // 4-2. 분야별 비교 막대 차트
    const barCtx = document.getElementById('fieldComparisonBarChart')?.getContext('2d');
    if (barCtx) {
      if (chartInstances.bar) chartInstances.bar.destroy();
      chartInstances.bar = new Chart(barCtx, {
        type: 'bar',
        data: {
          labels: labels.map(l => l.length > 12 ? l.substring(0, 12) + '...' : l),
          datasets: [
            {
              label: currentMeta.baseYearLabel,
              data: baseValues,
              backgroundColor: '#94a3b8',
              borderRadius: 6
            },
            {
              label: currentMeta.targetYearLabel,
              data: targetValues,
              backgroundColor: '#1d4ed8',
              borderRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 11 } } },
            y: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 } } }
          },
          plugins: {
            legend: { position: 'top', labels: { boxWidth: 12 } }
          }
        }
      });
    }
  }

  // 5. 선택된 세부사업 상세 인포그래픽 뷰 렌더링
  function renderDetailFocus(item) {
    const focusContainer = document.getElementById('focus-detail-container');
    if (!focusContainer) return;

    if (!item) {
      focusContainer.innerHTML = `
        <div class="empty-focus-state">
          <i class="fa-solid fa-hand-pointer"></i>
          <p>아래 세부 사업 카드를 클릭하면 해당 사업의 심층 인포그래픽과 보도자료 분석 원문이 표시됩니다.</p>
        </div>
      `;
      return;
    }

    const isIncrease = item.diff >= 0;
    const diffSign = isIncrease ? '+' : '';
    const unit = item.unit || '억원';

    focusContainer.innerHTML = `
      <div class="focus-card animate-fade-in">
        <div class="focus-header">
          <div class="focus-title-wrap">
            <span class="focus-category"><i class="fa-solid fa-bookmark"></i> ${item.field}</span>
            <h3 class="focus-title">${item.subProject}</h3>
          </div>
          <div class="focus-rate-badge ${isIncrease ? 'rate-up' : 'rate-down'}">
            <div class="rate-label">전년 대비 증감률</div>
            <div class="rate-val">${diffSign}${item.rate}%</div>
          </div>
        </div>

        <div class="focus-body-grid">
          <!-- 비교 메트릭 인포그래픽 -->
          <div class="focus-stat-block">
            <div class="stat-row">
              <div class="stat-col">
                <span class="stat-label">${currentMeta.baseYearLabel} 예산</span>
                <span class="stat-value text-muted">${formatNumber(item.baseYearVal)} <small>${unit}</small></span>
              </div>
              <div class="stat-arrow"><i class="fa-solid fa-circle-arrow-right"></i></div>
              <div class="stat-col">
                <span class="stat-label">${currentMeta.targetYearLabel} 정부안</span>
                <span class="stat-value text-primary">${formatNumber(item.targetYearVal)} <small>${unit}</small></span>
              </div>
            </div>

            <!-- 시각적 프로그레스 비교 바 -->
            <div class="comparison-bar-container">
              <div class="comp-bar-labels">
                <span>예산 확대 규모 (+${formatNumber(item.diff)} ${unit})</span>
                <span><strong>${item.targetYearVal > 0 ? ((item.baseYearVal / item.targetYearVal) * 100).toFixed(0) : 0}%</strong> → <strong>100%</strong></span>
              </div>
              <div class="comp-progress-track">
                <div class="comp-progress-base" style="width: ${item.targetYearVal > 0 ? Math.min(100, (item.baseYearVal / item.targetYearVal) * 100) : 0}%" title="${currentMeta.baseYearLabel}: ${formatNumber(item.baseYearVal)}"></div>
                <div class="comp-progress-diff ${isIncrease ? 'bg-diff-up' : 'bg-diff-down'}" style="width: ${item.targetYearVal > 0 ? Math.min(100, (Math.abs(item.diff) / item.targetYearVal) * 100) : 0}%" title="증감: ${formatNumber(item.diff)}"></div>
              </div>
              <div class="comp-legend">
                <span><i class="legend-dot base"></i> ${currentMeta.baseYearLabel}</span>
                <span><i class="legend-dot ${isIncrease ? 'diff-up' : 'diff-down'}"></i> 순증감 (+${formatNumber(item.diff)} ${unit})</span>
              </div>
            </div>
          </div>

          <!-- 보도자료 및 핵심 근거 인포그래픽 박스 -->
          <div class="focus-press-box">
            <div class="press-box-header">
              <i class="fa-solid fa-newspaper"></i>
              <span>핵심 내용 및 보도자료 박스 원문 근거</span>
            </div>
            <div class="press-box-content">
              ${highlightText(item.content)}
            </div>
            <div class="press-box-footer">
              <span class="press-tag"><i class="fa-solid fa-check-circle"></i> 정부안 공식 수치 확인</span>
              <span class="press-tag"><i class="fa-solid fa-scale-balanced"></i> 단위: ${unit}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // 6. 사업 카드 그리드 렌더링
  function renderProjectCards() {
    const listContainer = document.getElementById('project-cards-grid');
    if (!listContainer) return;

    // 검색어 필터링
    const searchInput = document.getElementById('search-input');
    const keyword = searchInput ? searchInput.value.trim().toLowerCase() : '';

    let filtered = currentData;
    if (activeField !== 'ALL') {
      filtered = filtered.filter(item => item.field === activeField);
    }
    if (keyword) {
      filtered = filtered.filter(item => 
        item.subProject.toLowerCase().includes(keyword) ||
        item.content.toLowerCase().includes(keyword) ||
        item.field.toLowerCase().includes(keyword)
      );
    }

    document.getElementById('visible-count').textContent = `${filtered.length}건`;

    if (filtered.length === 0) {
      listContainer.innerHTML = `
        <div class="no-results">
          <i class="fa-solid fa-magnifying-glass"></i>
          <p>조건에 일치하는 사업 항목이 없습니다.</p>
        </div>
      `;
      renderDetailFocus(null);
      return;
    }

    // 기본적으로 첫 번째 아이템이 선택되지 않았다면 첫 번째 아이템 선택
    if (!activeSubProjectId || !filtered.some(i => i.id === activeSubProjectId)) {
      activeSubProjectId = filtered[0].id;
    }

    // 상세 포커스 렌더링
    const selectedItem = filtered.find(i => i.id === activeSubProjectId) || filtered[0];
    renderDetailFocus(selectedItem);

    // 카드 그리드 렌더링
    listContainer.innerHTML = filtered.map(item => {
      const isSelected = item.id === activeSubProjectId;
      const isIncrease = item.diff >= 0;
      const unit = item.unit || '억원';

      return `
        <div class="project-card ${isSelected ? 'selected' : ''}" data-id="${item.id}">
          <div class="card-top">
            <span class="card-field-tag">${item.field}</span>
            <span class="card-rate-pill ${isIncrease ? 'up' : 'down'}">
              <i class="fa-solid fa-arrow-trend-${isIncrease ? 'up' : 'down'}"></i>
              ${isIncrease ? '+' : ''}${item.rate}%
            </span>
          </div>

          <h4 class="card-title">${item.subProject}</h4>

          <div class="card-figures">
            <div class="figure-row">
              <span class="fig-label">${currentMeta.baseYearLabel}</span>
              <span class="fig-val text-muted">${formatNumber(item.baseYearVal)} ${unit}</span>
            </div>
            <div class="figure-row highlight">
              <span class="fig-label">${currentMeta.targetYearLabel}</span>
              <span class="fig-val text-strong">${formatNumber(item.targetYearVal)} ${unit}</span>
            </div>
            <div class="figure-row diff">
              <span class="fig-label">증감액</span>
              <span class="fig-val ${isIncrease ? 'text-up' : 'text-down'}">${isIncrease ? '+' : ''}${formatNumber(item.diff)} ${unit}</span>
            </div>
          </div>

          <p class="card-snippet">
            ${item.content ? item.content.substring(0, 75) + (item.content.length > 75 ? '...' : '') : '내용 없음'}
          </p>

          <div class="card-footer-action">
            <span><i class="fa-solid fa-chart-simple"></i> 인포그래픽 보기</span>
            <i class="fa-solid fa-chevron-right"></i>
          </div>
        </div>
      `;
    }).join('');

    // 카드 클릭 이벤트 바인딩
    listContainer.querySelectorAll('.project-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        activeSubProjectId = isNaN(id) ? id : Number(id);
        
        // 카드 선택 스타일 갱신
        listContainer.querySelectorAll('.project-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');

        const item = currentData.find(i => String(i.id) === String(id));
        renderDetailFocus(item);

        // 부드러운 스크롤 (포커스 영역으로)
        const focusArea = document.getElementById('focus-detail-container');
        if (focusArea && window.innerWidth < 1024) {
          focusArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    });
  }

  // 7. 전체 뷰 업데이트 통합 함수
  function updateDashboardView() {
    renderOverviewKPIs();
    renderFieldTabs();
    renderOverviewCharts();
    renderProjectCards();
  }

  window.Dashboard = {
    setData: function (data, metadata) {
      currentData = data || [];
      if (metadata) currentMeta = { ...currentMeta, ...metadata };
      activeField = 'ALL';
      activeSubProjectId = currentData.length > 0 ? currentData[0].id : null;
      updateDashboardView();
    },
    refreshView: updateDashboardView,
    getAllData: function () {
      return currentData;
    },
    getFilteredData: function () {
      const searchInput = document.getElementById('search-input');
      const keyword = searchInput ? searchInput.value.trim().toLowerCase() : '';
      let filtered = currentData;
      if (activeField !== 'ALL') {
        filtered = filtered.filter(item => item.field === activeField);
      }
      if (keyword) {
        filtered = filtered.filter(item => 
          item.subProject.toLowerCase().includes(keyword) ||
          item.content.toLowerCase().includes(keyword) ||
          item.field.toLowerCase().includes(keyword)
        );
      }
      return filtered;
    },
    getMetadata: function () {
      return currentMeta;
    }
  };
})();
