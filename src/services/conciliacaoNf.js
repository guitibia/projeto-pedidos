'use strict';

function norm(s) { return String(s == null ? '' : s).trim().toLowerCase(); }

/**
 * Concilia itens recebidos numa NF contra as linhas de demanda pendentes de UM fornecedor.
 * Função pura: sem banco, sem HTTP.
 */
function conciliar(nfItens, linhasPendentes) {
  const alocacoes = [];
  const extras = [];

  const porCodigo = new Map();
  for (const l of linhasPendentes) {
    const cod = norm(l.codigo);
    if (!porCodigo.has(cod)) porCodigo.set(cod, []);
    // cópia local para não mutar o input do chamador
    porCodigo.get(cod).push({ id: l.id, qtd_pedida: Number(l.qtd_pedida) || 0,
      qtd_recebida: Number(l.qtd_recebida) || 0, created_at: l.created_at });
  }
  for (const arr of porCodigo.values()) {
    arr.sort((a, b) => {
      const ta = new Date(a.created_at).getTime() || 0;
      const tb = new Date(b.created_at).getTime() || 0;
      if (ta !== tb) return ta - tb;
      return (a.id || 0) - (b.id || 0);
    });
  }

  for (const item of nfItens) {
    let disponivel = Math.max(0, Math.floor(Number(item.qtd) || 0));
    const linhas = porCodigo.get(norm(item.codigo)) || [];
    for (const l of linhas) {
      if (disponivel <= 0) break;
      const falta = Math.max(0, l.qtd_pedida - l.qtd_recebida);
      if (falta <= 0) continue;
      const dar = Math.min(falta, disponivel);
      if (dar > 0) {
        alocacoes.push({ demanda_item_id: l.id, qtd: dar });
        l.qtd_recebida += dar;
        disponivel -= dar;
      }
    }
    if (disponivel > 0) extras.push({ codigo: item.codigo, qtd: disponivel });
  }

  return { alocacoes, extras };
}

module.exports = { conciliar };
