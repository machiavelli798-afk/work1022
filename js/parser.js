// parser.js - Excel/CSV 파싱 및 스마트 컬럼 매핑 모듈
(function () {
  'use strict';

  function cleanNumber(val) {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    // 문자열에서 쉼표, 공백, % 등 제거
    const str = String(val).replace(/,/g, '').replace(/%/g, '').trim();
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  }

  function detectColumnMapping(headers) {
    const mapping = {
      id: -1,
      field: -1,
      subProject: -1,
      unit: -1,
      baseYearVal: -1,
      targetYearVal: -1,
      diff: -1,
      rate: -1,
      content: -1,
      baseYearLabel: "기준연도",
      targetYearLabel: "대상연도"
    };

    headers.forEach((h, idx) => {
      const header = String(h || '').trim();
      
      if (/연번|no|순번|id/i.test(header) && mapping.id === -1) {
        mapping.id = idx;
      } else if (/분야|중점영역|대분류|카테고리/i.test(header) && mapping.field === -1) {
        mapping.field = idx;
      } else if (/세부\s*사업|주요\s*지표|사업명|프로젝트/i.test(header) && mapping.subProject === -1) {
        mapping.subProject = idx;
      } else if (/구분\/단위|구분|단위/i.test(header) && mapping.unit === -1) {
        mapping.unit = idx;
      } else if (/\(a\)|기준연도/i.test(header) || (/\d{4}년?/i.test(header) && mapping.baseYearVal === -1)) {
        mapping.baseYearVal = idx;
        const match = header.match(/(\d{4})년?/);
        if (match) mapping.baseYearLabel = match[1] + "년";
      } else if (/\(b\)|정부안|대상연도/i.test(header) || (/\d{4}년?/i.test(header) && mapping.targetYearVal === -1)) {
        mapping.targetYearVal = idx;
        const match = header.match(/(\d{4})년?/);
        if (match) mapping.targetYearLabel = match[1] + "년";
      } else if (/증감\s*\(b-a\)|증감/i.test(header) && mapping.diff === -1) {
        mapping.diff = idx;
      } else if (/증가율|증감률|비율/i.test(header) && mapping.rate === -1) {
        mapping.rate = idx;
      } else if (/핵심\s*내용|보도자료|원문|근거|요약|설명/i.test(header) && mapping.content === -1) {
        mapping.content = idx;
      }
    });

    // 기본 인덱스 보정 (정확한 위치로 매핑되지 않았을 때의 인덱스 폴백)
    if (mapping.id === -1) mapping.id = 0;
    if (mapping.field === -1) mapping.field = 1;
    if (mapping.subProject === -1) mapping.subProject = 2;
    if (mapping.unit === -1) mapping.unit = 3;
    if (mapping.baseYearVal === -1) mapping.baseYearVal = 4;
    if (mapping.targetYearVal === -1) mapping.targetYearVal = 5;
    if (mapping.diff === -1) mapping.diff = 6;
    if (mapping.rate === -1) mapping.rate = 7;
    if (mapping.content === -1) mapping.content = 8;

    return mapping;
  }

  function transformRows(rows, mapping) {
    if (!rows || rows.length === 0) return { data: [], metadata: {} };

    const result = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      // 행에 의미 있는 데이터가 있는지 확인
      const fieldVal = String(row[mapping.field] || '').trim();
      const subProjVal = String(row[mapping.subProject] || '').trim();
      if (!fieldVal && !subProjVal) continue;

      const baseVal = cleanNumber(row[mapping.baseYearVal]);
      const targetVal = cleanNumber(row[mapping.targetYearVal]);
      
      let diffVal = mapping.diff !== -1 && row[mapping.diff] !== undefined ? cleanNumber(row[mapping.diff]) : (targetVal - baseVal);
      let rateVal = mapping.rate !== -1 && row[mapping.rate] !== undefined ? cleanNumber(row[mapping.rate]) : (baseVal !== 0 ? ((diffVal / baseVal) * 100) : 0);

      result.push({
        id: row[mapping.id] || (i + 1),
        field: fieldVal || '기타 사업',
        subProject: subProjVal || `사업 ${i + 1}`,
        unit: String(row[mapping.unit] || '억원').trim(),
        baseYearVal: baseVal,
        targetYearVal: targetVal,
        diff: diffVal,
        rate: Math.round(rateVal * 10) / 10,
        content: String(row[mapping.content] || '').trim()
      });
    }

    return {
      data: result,
      metadata: {
        baseYearLabel: mapping.baseYearLabel || '2026년',
        targetYearLabel: mapping.targetYearLabel || '2027년'
      }
    };
  }

  // 엑셀 파싱 (SheetJS)
  function parseExcel(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

          if (!jsonRows || jsonRows.length < 2) {
            throw new Error("유효한 데이터 행이 존재하지 않습니다.");
          }

          const headers = jsonRows[0];
          const mapping = detectColumnMapping(headers);
          const parsed = transformRows(jsonRows.slice(1), mapping);
          resolve(parsed);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  // CSV 파싱
  function parseCSV(file) {
    return new Promise((resolve, reject) => {
      if (typeof Papa !== 'undefined') {
        Papa.parse(file, {
          skipEmptyLines: true,
          complete: function (results) {
            try {
              const rows = results.data;
              if (!rows || rows.length < 2) {
                throw new Error("유효한 CSV 데이터 행이 없습니다.");
              }
              const headers = rows[0];
              const mapping = detectColumnMapping(headers);
              const parsed = transformRows(rows.slice(1), mapping);
              resolve(parsed);
            } catch (err) {
              reject(err);
            }
          },
          error: reject
        });
      } else {
        // Fallback FileReader
        const reader = new FileReader();
        reader.onload = function (e) {
          try {
            const text = e.target.result;
            const lines = text.split(/\r\n|\n/).filter(l => l.trim().length > 0);
            const rows = lines.map(l => l.split(',').map(c => c.trim().replace(/^["']|["']$/g, '')));
            const headers = rows[0];
            const mapping = detectColumnMapping(headers);
            const parsed = transformRows(rows.slice(1), mapping);
            resolve(parsed);
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = reject;
        reader.readAsText(file, 'UTF-8');
      }
    });
  }

  window.DataParser = {
    parseFile: function (file) {
      const ext = file.name.split('.').pop().toLowerCase();
      if (ext === 'xlsx' || ext === 'xls') {
        return parseExcel(file);
      } else if (ext === 'csv') {
        return parseCSV(file);
      } else {
        return Promise.reject(new Error("지원하지 않는 파일 형식입니다 (.xlsx, .xls, .csv 지원)"));
      }
    }
  };
})();
