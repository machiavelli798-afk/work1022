// app.js - 파일 업로드 이벤트, 샘플 데이터 다운로드 및 앱 메인 컨트롤러
document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const uploadStatus = document.getElementById('upload-status');
  const fileNameDisplay = document.getElementById('file-name-display');
  const searchInput = document.getElementById('search-input');
  const resetBtn = document.getElementById('btn-reset-sample');
  const downloadSampleBtn = document.getElementById('btn-download-sample');
  const exportExcelBtn = document.getElementById('btn-export-excel');

  // 토스트 알림 표시
  function showToast(message, type = 'info') {
    const toast = document.getElementById('toast-notification');
    if (!toast) return;

    toast.className = `toast toast-${type} show`;
    toast.innerHTML = `
      <i class="fa-solid fa-${type === 'success' ? 'circle-check' : type === 'error' ? 'circle-exclamation' : 'circle-info'}"></i>
      <span>${message}</span>
    `;

    setTimeout(() => {
      toast.classList.remove('show');
    }, 3500);
  }

  // 파일 처리 공통 함수
  function handleFile(file) {
    if (!file) return;

    uploadStatus.style.display = 'inline-flex';
    fileNameDisplay.textContent = `파싱 중: ${file.name}...`;

    window.DataParser.parseFile(file)
      .then(result => {
        if (!result.data || result.data.length === 0) {
          throw new Error("파싱된 데이터가 비어 있습니다.");
        }
        window.Dashboard.setData(result.data, result.metadata);
        fileNameDisplay.textContent = `적용 완료: ${file.name} (${result.data.length}개 사업)`;
        showToast(`'${file.name}'에서 총 ${result.data.length}개 사업 데이터를 성공적으로 불러왔습니다!`, 'success');
      })
      .catch(err => {
        console.error("파일 파싱 오류:", err);
        fileNameDisplay.textContent = `오류 발생: ${file.name}`;
        showToast(err.message || "파일 파싱 중 문제가 발생했습니다.", 'error');
      });
  }

  // 드래그 앤 드롭 이벤트
  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-active');
    });

    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-active');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-active');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
      }
    });

    dropZone.addEventListener('click', () => {
      fileInput.click();
    });
  }

  // 파일 선택 인풋
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFile(e.target.files[0]);
      }
    });
  }

  // 검색 인풋
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      window.Dashboard.refreshView();
    });
  }

  // 샘플 데이터 복구 버튼
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      window.Dashboard.setData(window.SAMPLE_DATA, { baseYearLabel: '2026년', targetYearLabel: '2027년' });
      if (fileNameDisplay) fileNameDisplay.textContent = "기본 샘플 데이터 (예시 보도자료)";
      if (searchInput) searchInput.value = '';
      showToast("기본 샘플 데이터로 복원되었습니다.", 'info');
    });
  }

  // 전체/목록 사업 데이터 엑셀 저장 (Export to Excel)
  if (exportExcelBtn) {
    exportExcelBtn.addEventListener('click', () => {
      try {
        const meta = window.Dashboard.getMetadata();
        const dataToExport = window.Dashboard.getFilteredData();

        if (!dataToExport || dataToExport.length === 0) {
          showToast("저장할 사업 데이터가 없습니다.", 'error');
          return;
        }

        const baseLabel = `${meta.baseYearLabel || '2026년'} (A)`;
        const targetLabel = `${meta.targetYearLabel || '2027년 정부안'} (B)`;

        // 엑셀 헤더 행
        const rows = [
          ["연번", "분야 (중점영역)", "세부 사업 / 주요 지표", "구분/단위", baseLabel, targetLabel, "증감 (B-A)", "증가율 (%)", "핵심 내용 및 보도자료 박스 원문 근거"]
        ];

        // 데이터 행 추가
        dataToExport.forEach((item, index) => {
          rows.push([
            item.id || (index + 1),
            item.field,
            item.subProject,
            item.unit,
            item.baseYearVal,
            item.targetYearVal,
            item.diff,
            `${item.rate}%`,
            item.content
          ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(rows);

        // 컬럼 너비 설정 (가독성 향상)
        ws['!cols'] = [
          { wch: 8 },  // 연번
          { wch: 28 }, // 분야
          { wch: 38 }, // 세부 사업
          { wch: 10 }, // 단위
          { wch: 16 }, // 기준연도
          { wch: 18 }, // 대상연도
          { wch: 14 }, // 증감
          { wch: 12 }, // 증가율
          { wch: 60 }  // 핵심 내용
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "사업목록_결과");

        // 날짜 기반 파일명 생성
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
        const fileName = `정부예산_사업데이터_목록_${dateStr}.xlsx`;

        XLSX.writeFile(wb, fileName);
        showToast(`총 ${dataToExport.length}개 사업 목록이 '${fileName}' 파일로 저장되었습니다.`, 'success');
      } catch (err) {
        console.error("엑셀 저장 실패:", err);
        showToast("엑셀 파일 저장 중 오류가 발생했습니다.", 'error');
      }
    });
  }

  // 샘플 엑셀 다운로드 (SheetJS 활용)
  if (downloadSampleBtn) {
    downloadSampleBtn.addEventListener('click', () => {
      try {
        const rows = [
          ["연번", "분야 (중점영역)", "세부 사업 / 주요 지표", "구분/단위", "2026년 (A)", "2027년 정부안 (B)", "증감 (B-A)", "증가율 (%)", "핵심 내용 및 보도자료 박스 원문 근거"]
        ];

        window.SAMPLE_DATA.forEach(item => {
          rows.push([
            item.id,
            item.field,
            item.subProject,
            item.unit,
            item.baseYearVal,
            item.targetYearVal,
            item.diff,
            `${item.rate}%`,
            item.content
          ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "예산안_데이터");

        XLSX.writeFile(wb, "정부예산_세부사업_샘플양식.xlsx");
        showToast("샘플 엑셀 파일이 다운로드되었습니다.", 'success');
      } catch (err) {
        console.error("샘플 파일 다운로드 실패:", err);
        showToast("다운로드 중 오류가 발생했습니다.", 'error');
      }
    });
  }

  // 초기 샘플 데이터로 대시보드 구동
  if (window.SAMPLE_DATA && window.Dashboard) {
    window.Dashboard.setData(window.SAMPLE_DATA, { baseYearLabel: '2026년', targetYearLabel: '2027년' });
  }
});
