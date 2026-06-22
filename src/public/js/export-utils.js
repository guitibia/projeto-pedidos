function exportCsv(filename, headers, rows) {
  const esc = v => {
    const s = (v == null ? '' : String(v)).replace(/"/g, '""');
    return /[",\n;]/.test(s) ? `"${s}"` : s;
  };
  const linhas = [headers.map(esc).join(';'), ...rows.map(r => r.map(esc).join(';'))];
  const csv = '﻿' + linhas.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith('.csv') ? filename : filename + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportPdf(title, headers, rows) {
  const w = window.open('', '', 'width=900,height=650');
  const th = headers.map(h => `<th>${h}</th>`).join('');
  const trs = rows.map(r => `<tr>${r.map(c => `<td>${c == null ? '' : c}</td>`).join('')}</tr>`).join('');
  w.document.write(`<html><head><title>${title}</title><style>
    body{font-family:Arial,sans-serif;padding:24px;color:#222}
    h3{text-align:center;margin:0 0 16px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
    th{background:#f0f0f0}
    </style></head><body>
    <h3>${title}</h3>
    <table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>
    </body></html>`);
  w.document.close();
  w.focus();
  w.print();
}
