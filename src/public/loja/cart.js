const Cart = (() => {
  const KEY = 'loja_cart';
  function read(){ try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } }
  function write(items){ localStorage.setItem(KEY, JSON.stringify(items)); document.dispatchEvent(new Event('cart:changed')); }
  function getItems(){ return read(); }
  function getCount(){ return read().reduce((s,i)=>s+i.qty,0); }
  function getSubtotal(){ return read().reduce((s,i)=>s + (i.price * i.qty), 0); }
  function addItem(p, qty=1){
    const items = read(); const ex = items.find(i=>i.id===p.id);
    if (ex) ex.qty += qty; else items.push({ id:p.id, name:p.name, price:p.price, image:p.image||null, franchise:p.franchise||'', qty });
    write(items);
  }
  function setQty(id, qty){ const items=read(); const it=items.find(i=>i.id===id); if(it){ it.qty=Math.max(1,qty); write(items);} }
  function removeItem(id){ write(read().filter(i=>i.id!==id)); }
  function clear(){ write([]); }
  return { getItems, getCount, getSubtotal, addItem, setQty, removeItem, clear };
})();
