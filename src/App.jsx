import { Fragment, useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Package, FlaskConical, Boxes, ShoppingBag, LayoutGrid, Layers, Handshake,
  Plus, Trash2, AlertTriangle, Check, ChevronDown, ChevronUp, Lock, Settings, X, Truck, Pencil, Search
} from "lucide-react";
import { fetchAll, upsert, removeRow, pruneChildren, supabaseConfigured } from "./supabase.js";

/* ---------- Brand tokens ---------- */
const C = {
  ink: "#16231d",
  deep: "#124236",
  mid: "#2E5B4A",
  gold: "#A67C3D",
  tan: "#C9B89B",
  cream: "#F6F2E8",
  card: "#FFFDF8",
  line: "#E4DCC8",
  warn: "#9C4B2E",
  warnBg: "#F6E4DC",
};

/* ---------- Config ---------- */
const PARTNER_TYPES = ["Loja física", "Salão de beleza", "Revendedor(a)", "Distribuidor", "Outro"];

/* ---------- Helpers ---------- */
const brl = (n) => `R$ ${(isNaN(n) || n === undefined ? 0 : n).toFixed(2).replace(".", ",")}`;
const qtyFmt = (n) => Math.round(isNaN(n) ? 0 : n);
const num = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));
const uid = (prefix) => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
const autoSigla = (name) => (name || "PRD").replace(/[^A-Za-zÀ-ÿ]/g, "").slice(0, 3).toUpperCase() || "PRD";

function nextLoteCode(product, lotes) {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  const sigla = (product.sigla || autoSigla(product.name)).toUpperCase();
  const prefix = `${sigla}-${mm}-${yyyy}-`;
  const countThisMonth = lotes.filter((l) => l.productId === product.id && l.code.startsWith(prefix)).length;
  const nn = String(countThisMonth + 1).padStart(2, "0");
  return `${prefix}${nn}`;
}

function localGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
function localSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

// Data de hoje no fuso do aparelho (toISOString usa UTC e "pula" pro dia seguinte à noite no Brasil)
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const sortByName = (arr) => [...arr].sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR", { sensitivity: "base" }));
const fmtDate = (d) => (d ? String(d).split("-").reverse().join("/") : "—");
const idStamp = (id) => Number(String(id).split("_")[1]) || 0;
const SUPPLIER_CATEGORIES = ["Insumo", "Rótulo", "Embalagem", "Outro"];

async function loadAllFromSupabase() {
  const [ingRows, purchaseRows, prodRows, itemRows, loteRows, partnerRows, saleRows, supplierRows] = await Promise.all([
    fetchAll("ingredients"), fetchAll("ingredient_purchases"), fetchAll("products"),
    fetchAll("product_items"), fetchAll("lotes"), fetchAll("partners"), fetchAll("sales"), fetchAll("suppliers"),
  ]);

  const purchasesByIng = {};
  purchaseRows.forEach((p) => {
    (purchasesByIng[p.ingredient_id] ||= []).push({ date: p.date, qty: p.qty, value: p.value, unitCost: p.unit_cost, supplierId: p.supplier_id || null });
  });
  const ingredients = ingRows.map((i) => ({ id: i.id, name: i.name, unit: i.unit, stock: i.stock, avgCost: i.avg_cost, purchases: purchasesByIng[i.id] || [] }));

  const itemsByProduct = {};
  itemRows.forEach((it) => { (itemsByProduct[it.product_id] ||= []).push({ ing: it.ingredient_id, amt: it.amount }); });
  const products = prodRows.map((p) => ({
    id: p.id, sigla: p.sigla, linha: p.linha, name: p.name, unitLabel: p.unit_label,
    unitSize: p.unit_size, unitType: p.unit_type, totalYield: p.total_yield, items: itemsByProduct[p.id] || [],
  }));
  const prices = Object.fromEntries(prodRows.map((p) => [p.id, p.price || 0]));
  const packaging = Object.fromEntries(prodRows.map((p) => [p.id, {
    frasco: p.frasco_cost || 0, rotulo: p.rotulo_cost || 0,
    frascoSupplierId: p.frasco_supplier_id || "", rotuloSupplierId: p.rotulo_supplier_id || "",
  }]));

  const lotes = loteRows.map((l) => ({ id: l.id, code: l.code, productId: l.product_id, qty: l.qty, qtyRemaining: l.qty_remaining, date: l.date, totalCost: l.total_cost, costPerUnit: l.cost_per_unit }));
  const partners = partnerRows.map((p) => ({ id: p.id, name: p.name, tipo: p.tipo, contato: p.contato, endereco: p.endereco }));
  const sales = saleRows.map((s) => ({
    id: s.id, date: s.date, productId: s.product_id, loteId: s.lote_id, qty: s.qty, unitPrice: s.unit_price, unitCost: s.unit_cost,
    revenue: s.revenue, costOfGoods: s.cost_of_goods, profit: s.profit, canal: s.canal, partnerId: s.partner_id, paid: s.paid,
    customerName: s.customer_name || "", paidDate: s.paid_date || null,
  }));
  const suppliers = supplierRows.map((s) => ({ id: s.id, name: s.name, category: s.category || "Insumo", contato: s.contato || "" }));

  return { ingredients, products, lotes, partners, sales, prices, packaging, suppliers };
}

function ingredientRow(i) { return { id: i.id, name: i.name, unit: i.unit, stock: i.stock, avg_cost: i.avgCost }; }
function purchaseRowsFor(i) { return (i.purchases || []).map((p, idx) => ({ id: `${i.id}_p${idx}`, ingredient_id: i.id, date: p.date, qty: p.qty, value: p.value, unit_cost: p.unitCost, supplier_id: p.supplierId || null })); }
function productRow(p, prices, packaging) {
  const pack = packaging[p.id] || { frasco: 0, rotulo: 0 };
  return {
    id: p.id, sigla: p.sigla, linha: p.linha, name: p.name, unit_label: p.unitLabel, unit_size: p.unitSize, unit_type: p.unitType, total_yield: p.totalYield,
    price: prices[p.id] || 0, frasco_cost: pack.frasco || 0, rotulo_cost: pack.rotulo || 0,
    frasco_supplier_id: pack.frascoSupplierId || null, rotulo_supplier_id: pack.rotuloSupplierId || null,
  };
}
function itemRowsFor(p) { return (p.items || []).map((it, idx) => ({ id: `${p.id}_i${idx}`, product_id: p.id, ingredient_id: it.ing, amount: it.amt })); }
function loteRow(l) { return { id: l.id, code: l.code, product_id: l.productId, qty: l.qty, qty_remaining: l.qtyRemaining, date: l.date, total_cost: l.totalCost, cost_per_unit: l.costPerUnit }; }
function partnerRow(p) { return { id: p.id, name: p.name, tipo: p.tipo, contato: p.contato, endereco: p.endereco }; }
function saleRow(s) {
  return {
    id: s.id, date: s.date, product_id: s.productId, lote_id: s.loteId, qty: s.qty, unit_price: s.unitPrice, unit_cost: s.unitCost,
    revenue: s.revenue, cost_of_goods: s.costOfGoods, profit: s.profit, canal: s.canal, partner_id: s.partnerId || null, paid: s.paid,
    customer_name: s.customerName || null, paid_date: s.paidDate || null,
  };
}
function supplierRow(s) { return { id: s.id, name: s.name, category: s.category, contato: s.contato }; }

// Gravação em ordem: primeiro os "pais", depois os "filhos" (por causa das chaves estrangeiras).
async function syncSuppliers(suppliers) { await upsert("suppliers", suppliers.map(supplierRow)); }
async function syncIngredients(ingredients) {
  await upsert("ingredients", ingredients.map(ingredientRow));
  await upsert("ingredient_purchases", ingredients.flatMap(purchaseRowsFor));
}
async function syncPartners(partners) { await upsert("partners", partners.map(partnerRow)); }
async function syncLotes(lotes) { await upsert("lotes", lotes.map(loteRow)); }
async function syncSales(sales) { await upsert("sales", sales.map(saleRow)); }

/* ---------- Small UI atoms ---------- */
function Card({ children, style }) {
  return <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, ...style }}>{children}</div>;
}
function SectionTitle({ children, sub }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 600, color: C.deep, margin: 0 }}>{children}</h2>
      {sub && <p style={{ color: "#6b6255", fontSize: 13.5, margin: "4px 0 0" }}>{sub}</p>}
    </div>
  );
}
function NumInput({ value, onChange, width = 84, suffix }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <input type="number" value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width, padding: "6px 8px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13.5, fontFamily: "inherit", background: "#fff", color: C.ink }} />
      {suffix && <span style={{ fontSize: 12, color: "#8a8171" }}>{suffix}</span>}
    </span>
  );
}
function TextInput({ value, onChange, width, placeholder }) {
  return (
    <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
      style={{ width, padding: "6px 8px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13.5, fontFamily: "inherit", background: "#fff", color: C.ink }} />
  );
}
function Select({ value, onChange, children, width }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width, padding: "6px 8px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13.5 }}>{children}</select>;
}
function GhostButton({ children, onClick, color = C.deep }) {
  return <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${color}`, color, borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 600 }}>{children}</button>;
}
function SolidButton({ children, onClick, bg = C.deep, full }) {
  return <button onClick={onClick} style={{ width: full ? "100%" : "auto", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: bg, color: "#fff", border: "none", borderRadius: 10, padding: "11px 16px", fontSize: 14, fontWeight: 600 }}>{children}</button>;
}
function Pill({ children, tone = C.mid, bg = "#E4EEE4" }) {
  return <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, color: tone, background: bg, borderRadius: 20, padding: "2px 9px" }}>{children}</span>;
}
function Empty({ children }) {
  return <div style={{ fontSize: 13, color: "#8a8171", textAlign: "center", padding: 14 }}>{children}</div>;
}

/* ---------- App ---------- */
export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null); // { text, retry }
  const [ingredients, setIngredients] = useState([]);
  const [products, setProducts] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [partners, setPartners] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [prices, setPrices] = useState({});
  const [packaging, setPackaging] = useState({});
  const [sales, setSales] = useState([]);
  const [pin, setPin] = useState(undefined); // undefined = loading, null = not set yet
  const [unlocked, setUnlocked] = useState(false);
  const [adminPin, setAdminPin] = useState(null);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminAsk, setAdminAsk] = useState(null); // { action } enquanto pede o PIN de administrador

  const chain = useRef(Promise.resolve());
  const prunedItems = useRef(new Map());
  const stateRef = useRef({});
  stateRef.current = { ingredients, products, lotes, partners, suppliers, prices, packaging, sales };

  const notify = useCallback((text, retry = false) => setNotice({ text, retry }), []);

  // Tudo que mexe no banco entra numa fila única: uma coisa por vez, na ordem em que foi pedida.
  const exclusive = useCallback((fn, { report = true } = {}) => {
    const p = chain.current.then(fn);
    chain.current = p.catch((e) => { if (report) notify(e?.message || String(e), true); });
    return p;
  }, [notify]);
  const enqueue = useCallback((fn) => { exclusive(fn).catch(() => {}); }, [exclusive]);

  const loadAll = useCallback(async () => {
    setLoadError(null);
    try {
      if (supabaseConfigured) {
        const data = await loadAllFromSupabase();
        setIngredients(data.ingredients);
        setProducts(data.products);
        setPrices(data.prices);
        setPackaging(data.packaging);
        setLotes(data.lotes);
        setPartners(data.partners);
        setSales(data.sales);
        setSuppliers(data.suppliers);
        prunedItems.current = new Map(data.products.map((p) => [p.id, p.items]));
      }
      setPin(localGet("kemia_pin", null));
      setAdminPin(localGet("kemia_admin_pin", null));
      setLoaded(true);
    } catch (e) {
      setLoadError(e?.message || String(e));
    }
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);

  const syncProducts = async (prods, prc, pack) => {
    await upsert("products", prods.map((p) => productRow(p, prc, pack)));
    await upsert("product_items", prods.flatMap(itemRowsFor));
    for (const p of prods) {
      if (prunedItems.current.get(p.id) !== p.items) {
        await pruneChildren("product_items", "product_id", p.id, itemRowsFor(p).map((r) => r.id));
        prunedItems.current.set(p.id, p.items);
      }
    }
  };

  // Cada efeito espera 0,3s (pra não gravar a cada tecla) e entra na fila. A ordem das linhas abaixo é a ordem de gravação.
  const canSync = loaded && supabaseConfigured;
  useEffect(() => { if (!canSync) return; const t = setTimeout(() => enqueue(() => syncSuppliers(suppliers)), 300); return () => clearTimeout(t); }, [suppliers, canSync, enqueue]);
  useEffect(() => { if (!canSync) return; const t = setTimeout(() => enqueue(() => syncIngredients(ingredients)), 300); return () => clearTimeout(t); }, [ingredients, canSync, enqueue]);
  useEffect(() => { if (!canSync) return; const t = setTimeout(() => enqueue(() => syncProducts(products, prices, packaging)), 300); return () => clearTimeout(t); }, [products, prices, packaging, canSync, enqueue]);
  useEffect(() => { if (!canSync) return; const t = setTimeout(() => enqueue(() => syncPartners(partners)), 300); return () => clearTimeout(t); }, [partners, canSync, enqueue]);
  useEffect(() => { if (!canSync) return; const t = setTimeout(() => enqueue(() => syncLotes(lotes)), 300); return () => clearTimeout(t); }, [lotes, canSync, enqueue]);
  useEffect(() => { if (!canSync) return; const t = setTimeout(() => enqueue(() => syncSales(sales)), 300); return () => clearTimeout(t); }, [sales, canSync, enqueue]);

  const retryAll = () => {
    setNotice(null);
    exclusive(async () => {
      const s = stateRef.current;
      await syncSuppliers(s.suppliers);
      await syncIngredients(s.ingredients);
      await syncProducts(s.products, s.prices, s.packaging);
      await syncPartners(s.partners);
      await syncLotes(s.lotes);
      await syncSales(s.sales);
    }).catch(() => {});
  };

  // Ações sensíveis (editar/apagar): só pedem PIN se um PIN de administrador tiver sido criado.
  const requestAdmin = useCallback((action) => () => {
    if (!adminPin || adminUnlocked) action(); else setAdminAsk({ action });
  }, [adminPin, adminUnlocked]);

  const ingById = useMemo(() => Object.fromEntries(ingredients.map((i) => [i.id, i])), [ingredients]);
  const productById = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const partnerById = useMemo(() => Object.fromEntries(partners.map((p) => [p.id, p])), [partners]);
  const costPerUnit = useCallback((ing) => (ing ? ing.avgCost || 0 : 0), []);

  const stockByProduct = useMemo(() => {
    const m = {};
    for (const l of lotes) m[l.productId] = (m[l.productId] || 0) + l.qtyRemaining;
    return m;
  }, [lotes]);
  const stockValueByProduct = useMemo(() => {
    const m = {};
    for (const l of lotes) m[l.productId] = (m[l.productId] || 0) + l.qtyRemaining * l.costPerUnit;
    return m;
  }, [lotes]);

  const supplierById = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s])), [suppliers]);

  // Os "remover" atualizam a tela na hora; se o banco recusar, a tela volta ao que era e o motivo aparece num aviso.
  const removeIng = async (id) => {
    const emUso = products.filter((p) => (p.items || []).some((it) => it.ing === id));
    if (emUso.length) { notify(`Esse insumo está na fórmula de: ${emUso.map((p) => p.name).join(", ")}. Tire ele da fórmula antes de apagar.`); return; }
    const snap = ingredients;
    setIngredients((prev) => prev.filter((i) => i.id !== id));
    try { await exclusive(() => removeRow("ingredients", id), { report: false }); }
    catch (e) { setIngredients(snap); notify(e.message); }
  };

  const removePartner = async (id) => {
    if (sales.some((s) => s.partnerId === id)) { notify("Esse parceiro tem vendas registradas — apagar ele apagaria o histórico. Mantenha o cadastro."); return; }
    const snap = partners;
    setPartners((prev) => prev.filter((p) => p.id !== id));
    try { await exclusive(() => removeRow("partners", id), { report: false }); }
    catch (e) { setPartners(snap); notify(e.message); }
  };

  const removeSupplier = async (id) => {
    const snap = { suppliers, ingredients, packaging };
    setSuppliers((prev) => prev.filter((s) => s.id !== id));
    setIngredients((prev) => prev.map((i) => ({ ...i, purchases: (i.purchases || []).map((p) => (p.supplierId === id ? { ...p, supplierId: null } : p)) })));
    setPackaging((prev) => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, {
      ...v,
      frascoSupplierId: v.frascoSupplierId === id ? "" : v.frascoSupplierId,
      rotuloSupplierId: v.rotuloSupplierId === id ? "" : v.rotuloSupplierId,
    }])));
    try { await exclusive(() => removeRow("suppliers", id), { report: false }); }
    catch (e) { setSuppliers(snap.suppliers); setIngredients(snap.ingredients); setPackaging(snap.packaging); notify(e.message); }
  };

  const removeProduct = async (id) => {
    const snap = { products, prices, packaging, lotes, sales };
    const relSales = sales.filter((s) => s.productId === id);
    const relLotes = lotes.filter((l) => l.productId === id);
    setProducts((prev) => prev.filter((p) => p.id !== id));
    setPrices((prev) => { const n = { ...prev }; delete n[id]; return n; });
    setPackaging((prev) => { const n = { ...prev }; delete n[id]; return n; });
    setLotes((prev) => prev.filter((l) => l.productId !== id));
    setSales((prev) => prev.filter((s) => s.productId !== id));
    try {
      await exclusive(async () => {
        for (const s of relSales) await removeRow("sales", s.id);
        for (const l of relLotes) await removeRow("lotes", l.id);
        await removeRow("products", id);
      }, { report: false });
    } catch (e) {
      setProducts(snap.products); setPrices(snap.prices); setPackaging(snap.packaging); setLotes(snap.lotes); setSales(snap.sales);
      notify(e.message);
    }
  };

  const removeLote = async (id) => {
    const snap = { lotes, sales };
    const relSales = sales.filter((s) => s.loteId === id);
    setSales((prev) => prev.filter((s) => s.loteId !== id));
    setLotes((prev) => prev.filter((l) => l.id !== id));
    try {
      await exclusive(async () => {
        for (const s of relSales) await removeRow("sales", s.id);
        await removeRow("lotes", id);
      }, { report: false });
    } catch (e) { setLotes(snap.lotes); setSales(snap.sales); notify(e.message); }
  };

  const resetValores = async () => {
    const snap = { ingredients, packaging, prices, lotes, partners, sales };
    const delPurchases = ingredients.flatMap((i) => (i.purchases || []).map((_, idx) => `${i.id}_p${idx}`));
    setIngredients((prev) => prev.map((i) => ({ ...i, stock: 0, avgCost: 0, purchases: [] })));
    setPrices(Object.fromEntries(products.map((p) => [p.id, 0])));
    setPackaging(Object.fromEntries(products.map((p) => [p.id, { ...(packaging[p.id] || {}), frasco: 0, rotulo: 0 }])));
    setLotes([]); setPartners([]); setSales([]);
    try {
      await exclusive(async () => {
        for (const s of snap.sales) await removeRow("sales", s.id);
        for (const l of snap.lotes) await removeRow("lotes", l.id);
        for (const p of snap.partners) await removeRow("partners", p.id);
        for (const id of delPurchases) await removeRow("ingredient_purchases", id);
      }, { report: false });
    } catch (e) {
      setIngredients(snap.ingredients); setPackaging(snap.packaging); setPrices(snap.prices);
      setLotes(snap.lotes); setPartners(snap.partners); setSales(snap.sales);
      notify(e.message);
    }
  };

  const resetTudo = async () => {
    const snap = { ingredients, products, lotes, partners, suppliers, prices, packaging, sales };
    setIngredients([]); setProducts([]); setLotes([]); setPartners([]); setSuppliers([]); setPrices({}); setPackaging({}); setSales([]);
    try {
      await exclusive(async () => {
        for (const s of snap.sales) await removeRow("sales", s.id);
        for (const l of snap.lotes) await removeRow("lotes", l.id);
        for (const p of snap.products) await removeRow("products", p.id);
        for (const p of snap.partners) await removeRow("partners", p.id);
        for (const i of snap.ingredients) await removeRow("ingredients", i.id);
        for (const s of snap.suppliers) await removeRow("suppliers", s.id);
      }, { report: false });
    } catch (e) {
      setIngredients(snap.ingredients); setProducts(snap.products); setLotes(snap.lotes); setPartners(snap.partners);
      setSuppliers(snap.suppliers); setPrices(snap.prices); setPackaging(snap.packaging); setSales(snap.sales);
      notify(e.message);
    }
  };

  const changePin = (newPin) => {
    setPin(newPin);
    localSet("kemia_pin", newPin);
  };

  const changeAdminPin = (newPin) => {
    setAdminPin(newPin);
    setAdminUnlocked(false);
    localSet("kemia_admin_pin", newPin);
  };

  const esqueciSenha = () => {
    resetTudo();
    changePin(null);
    changeAdminPin(null);
    setUnlocked(false);
  };

  const valorEstoqueInsumos = useMemo(() => ingredients.reduce((s, i) => s + i.stock * costPerUnit(i), 0), [ingredients, costPerUnit]);
  const valorEstoqueProdutosCusto = useMemo(() => Object.values(stockValueByProduct).reduce((a, b) => a + b, 0), [stockValueByProduct]);
  const valorEstoqueProdutosVenda = useMemo(() => products.reduce((s, p) => s + (stockByProduct[p.id] || 0) * (prices[p.id] || 0), 0), [products, stockByProduct, prices]);
  const recebido = useMemo(() => sales.filter((s) => s.paid).reduce((s, v) => s + v.revenue, 0), [sales]);
  const aReceber = useMemo(() => sales.filter((s) => !s.paid).reduce((s, v) => s + v.revenue, 0), [sales]);
  const custoVendasPagas = useMemo(() => sales.filter((s) => s.paid).reduce((s, v) => s + v.costOfGoods, 0), [sales]);
  const lucroRealizado = recebido - custoVendasPagas;
  const semEstoque = useMemo(() => ingredients.filter((i) => i.stock <= 0), [ingredients]);

  const tabs = [
    { id: "dashboard", label: "Painel", icon: LayoutGrid },
    { id: "insumos", label: "Insumos", icon: Package },
    { id: "produtos", label: "Produtos", icon: Layers },
    { id: "producao", label: "Produção", icon: FlaskConical },
    { id: "estoque", label: "Estoque", icon: Boxes },
    { id: "fornecedores", label: "Fornecedores", icon: Truck },
    { id: "parceiros", label: "Parceiros", icon: Handshake },
    { id: "vendas", label: "Vendas", icon: ShoppingBag },
    { id: "config", label: "Config", icon: Settings },
  ];

  if (loadError) {
    return (
      <AuthShell>
        <Card style={{ background: "#FFFDF8" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <AlertTriangle size={16} color={C.warn} />
            <div style={{ fontSize: 14, fontWeight: 600, color: C.warn }}>Não consegui carregar seus dados</div>
          </div>
          <div style={{ fontSize: 12.5, color: "#6b6255", marginBottom: 14 }}>{loadError}</div>
          <SolidButton onClick={() => { setLoaded(false); loadAll(); }} full>Tentar de novo</SolidButton>
        </Card>
      </AuthShell>
    );
  }
  if (!loaded) {
    return (
      <div style={{ minHeight: "100vh", background: C.deep, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif", color: C.tan, fontSize: 13 }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&display=swap');`}</style>
        Carregando…
      </div>
    );
  }
  if (!pin) {
    return <SetupPinScreen onCreate={(newPin) => { changePin(newPin); setUnlocked(true); }} />;
  }
  if (!unlocked) {
    return <UnlockScreen pin={pin} onUnlock={() => setUnlocked(true)} onForgot={esqueciSenha} />;
  }

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: C.cream, minHeight: "100vh", color: C.ink }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        table { border-collapse: collapse; width: 100%; }
        th { text-align: left; font-size: 11.5px; letter-spacing: .02em; color: #8a8171; font-weight: 600; padding: 6px 8px; border-bottom: 1px solid ${C.line}; }
        td { padding: 7px 8px; font-size: 13.5px; border-bottom: 1px solid ${C.line}; vertical-align: middle; }
        button { cursor: pointer; font-family: inherit; }
        select { font-family: inherit; }
        input:focus, select:focus { outline: 2px solid ${C.gold}; outline-offset: 1px; }
      `}</style>

      <header style={{ background: C.deep, padding: "22px 20px 20px", color: "#F3EFE3" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
          <svg width="30" height="30" viewBox="0 0 40 40" fill="none">
            <path d="M20 5c5 5 6 10 3 15-2 3-6 3-8 0-2-3-1-8 5-15z" stroke={C.gold} strokeWidth="1.6" />
            <circle cx="20" cy="26" r="6" stroke={C.gold} strokeWidth="1.6" />
          </svg>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, letterSpacing: "0.06em", fontWeight: 600 }}>KEMIA</div>
            <div style={{ fontSize: 11.5, color: C.tan, letterSpacing: "0.03em", marginTop: -2 }}>Gestão de produção · Bioativos Amazônicos</div>
          </div>
        </div>
      </header>

      <nav style={{ position: "sticky", top: 0, zIndex: 10, background: C.mid, display: "flex", overflowX: "auto", borderBottom: `1px solid ${C.deep}` }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", width: "100%" }}>
          {tabs.map((t) => {
            const Icon = t.icon; const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ flex: "1 0 auto", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "12px 10px", background: "transparent", border: "none", borderBottom: active ? `2px solid ${C.gold}` : "2px solid transparent", color: active ? "#fff" : "#D9D2C2", fontWeight: active ? 600 : 500, fontSize: 12, whiteSpace: "nowrap" }}>
                <Icon size={13} />{t.label}
              </button>
            );
          })}
        </div>
      </nav>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "22px 16px 60px" }}>
        {tab === "dashboard" && (
          <Dashboard products={products} partners={partners} sales={sales}
            valorEstoqueInsumos={valorEstoqueInsumos} valorEstoqueProdutosCusto={valorEstoqueProdutosCusto} valorEstoqueProdutosVenda={valorEstoqueProdutosVenda}
            recebido={recebido} aReceber={aReceber} lucroRealizado={lucroRealizado} semEstoque={semEstoque}
            stockByProduct={stockByProduct} prices={prices} lotes={lotes} productById={productById} partnerById={partnerById} />
        )}
        {tab === "insumos" && (
          <Insumos ingredients={ingredients} setIngredients={setIngredients} costPerUnit={costPerUnit}
            suppliers={suppliers} supplierById={supplierById} onRemove={removeIng} requestAdmin={requestAdmin} />
        )}
        {tab === "produtos" && <Produtos products={products} setProducts={setProducts} ingredients={ingredients} removeProduct={removeProduct} requestAdmin={requestAdmin} />}
        {tab === "producao" && (
          <Producao products={products} ingredients={ingredients} setIngredients={setIngredients} ingById={ingById}
            costPerUnit={costPerUnit} packaging={packaging} setPackaging={setPackaging} lotes={lotes} setLotes={setLotes} suppliers={suppliers} />
        )}
        {tab === "estoque" && (
          <Estoque products={products} lotes={lotes} setLotes={setLotes} prices={prices} setPrices={setPrices} stockByProduct={stockByProduct}
            sales={sales} onRemoveLote={removeLote} requestAdmin={requestAdmin} />
        )}
        {tab === "fornecedores" && (
          <Fornecedores suppliers={suppliers} setSuppliers={setSuppliers} ingredients={ingredients} onRemove={removeSupplier} requestAdmin={requestAdmin} />
        )}
        {tab === "parceiros" && <Parceiros partners={partners} setPartners={setPartners} sales={sales} productById={productById} onRemove={removePartner} requestAdmin={requestAdmin} />}
        {tab === "vendas" && (
          <Vendas products={products} lotes={lotes} setLotes={setLotes} prices={prices} partners={partners}
            sales={sales} setSales={setSales} productById={productById} partnerById={partnerById} />
        )}
        {tab === "config" && (
          <Configuracoes pin={pin} onChangePin={changePin} onResetValores={resetValores} onResetTudo={resetTudo}
            ingredients={ingredients} products={products} lotes={lotes} partners={partners} sales={sales} prices={prices} packaging={packaging}
            suppliers={suppliers} adminPin={adminPin} onChangeAdminPin={changeAdminPin} adminUnlocked={adminUnlocked}
            onLockAdmin={() => setAdminUnlocked(false)} requestAdmin={requestAdmin} />
        )}
      </main>

      {notice && (
        <div role="alert" style={{ position: "fixed", left: 12, right: 12, bottom: 12, zIndex: 60, background: C.warn, color: "#fff", borderRadius: 12, padding: "12px 14px", fontSize: 13, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", boxShadow: "0 6px 20px rgba(0,0,0,.25)" }}>
          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
          <span style={{ flex: "1 1 220px" }}>{notice.text}</span>
          {notice.retry && <button onClick={retryAll} style={{ background: "#fff", color: C.warn, border: "none", borderRadius: 8, padding: "6px 10px", fontWeight: 600, fontSize: 12.5 }}>Tentar de novo</button>}
          <button onClick={() => setNotice(null)} style={{ background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,.6)", borderRadius: 8, padding: "6px 10px", fontSize: 12.5 }}>Fechar</button>
        </div>
      )}

      {adminAsk && (
        <AdminUnlockModal
          adminPin={adminPin}
          onCancel={() => setAdminAsk(null)}
          onUnlock={() => { const a = adminAsk.action; setAdminUnlocked(true); setAdminAsk(null); a(); }}
        />
      )}
    </div>
  );
}

/* ---------- Desbloqueio de ações sensíveis ---------- */
function AdminUnlockModal({ onCancel, onUnlock, adminPin }) {
  const [val, setVal] = useState("");
  const [err, setErr] = useState("");
  const tentar = () => { if (val === adminPin) onUnlock(); else setErr("PIN de administrador incorreto."); };
  return (
    <div role="dialog" aria-label="PIN de administrador" style={{ position: "fixed", inset: 0, background: "rgba(18,66,54,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 70 }}>
      <Card style={{ width: "100%", maxWidth: 320, background: "#FFFDF8" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Lock size={16} color={C.deep} />
          <div style={{ fontSize: 14, fontWeight: 600, color: C.deep }}>Ação protegida</div>
        </div>
        <div style={{ fontSize: 12.5, color: "#8a8171", marginBottom: 12 }}>Essa alteração é sensível (editar ou apagar). Digite o PIN de administrador pra continuar.</div>
        <input type="password" autoFocus placeholder="PIN de administrador" value={val}
          onChange={(e) => { setVal(e.target.value); setErr(""); }} onKeyDown={(e) => e.key === "Enter" && tentar()}
          style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 14 }} />
        {err && <div style={{ color: C.warn, fontSize: 12.5, marginTop: 8 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <SolidButton onClick={tentar}><Lock size={14} /> Desbloquear</SolidButton>
          <GhostButton onClick={onCancel}>Cancelar</GhostButton>
        </div>
      </Card>
    </div>
  );
}

/* ---------- Acesso (PIN) ---------- */
function AuthShell({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: C.deep, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif", padding: 20 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Inter:wght@400;500;600;700&display=swap'); input:focus{outline:2px solid ${C.gold};}`}</style>
      <div style={{ width: "100%", maxWidth: 320 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 22 }}>
          <svg width="34" height="34" viewBox="0 0 40 40" fill="none" style={{ marginBottom: 8 }}>
            <path d="M20 5c5 5 6 10 3 15-2 3-6 3-8 0-2-3-1-8 5-15z" stroke={C.gold} strokeWidth="1.6" />
            <circle cx="20" cy="26" r="6" stroke={C.gold} strokeWidth="1.6" />
          </svg>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, letterSpacing: "0.06em", fontWeight: 600, color: "#F3EFE3" }}>KEMIA</div>
          <div style={{ fontSize: 11, color: C.tan, letterSpacing: "0.03em" }}>Gestão de produção</div>
        </div>
        {children}
      </div>
    </div>
  );
}

function SetupPinScreen({ onCreate }) {
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [err, setErr] = useState("");
  const confirmar = () => {
    if (p1.length < 4) { setErr("Use pelo menos 4 dígitos/caracteres."); return; }
    if (p1 !== p2) { setErr("As senhas não coincidem."); return; }
    onCreate(p1);
  };
  return (
    <AuthShell>
      <Card style={{ background: "#FFFDF8" }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: C.deep, marginBottom: 4 }}>Criar senha de acesso</div>
        <div style={{ fontSize: 12, color: "#8a8171", marginBottom: 14 }}>Só quem souber essa senha abre o app neste aparelho/navegador.</div>
        <input type="password" placeholder="Nova senha" value={p1} onChange={(e) => setP1(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 14, marginBottom: 8 }} />
        <input type="password" placeholder="Confirmar senha" value={p2} onChange={(e) => setP2(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 14 }} />
        {err && <div style={{ color: C.warn, fontSize: 12.5, marginTop: 8 }}>{err}</div>}
        <div style={{ marginTop: 14 }}><SolidButton onClick={confirmar} full><Lock size={14} /> Criar senha</SolidButton></div>
      </Card>
    </AuthShell>
  );
}

function UnlockScreen({ pin, onUnlock, onForgot }) {
  const [val, setVal] = useState("");
  const [err, setErr] = useState("");
  const [confirmForgot, setConfirmForgot] = useState(false);
  const tentar = () => { if (val === pin) onUnlock(); else setErr("Senha incorreta."); };
  return (
    <AuthShell>
      <Card style={{ background: "#FFFDF8" }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: C.deep, marginBottom: 10 }}>Digite sua senha</div>
        <input type="password" autoFocus placeholder="Senha" value={val} onChange={(e) => { setVal(e.target.value); setErr(""); }} onKeyDown={(e) => e.key === "Enter" && tentar()} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 14 }} />
        {err && <div style={{ color: C.warn, fontSize: 12.5, marginTop: 8 }}>{err}</div>}
        <div style={{ marginTop: 14 }}><SolidButton onClick={tentar} full><Lock size={14} /> Entrar</SolidButton></div>

        {!confirmForgot ? (
          <button onClick={() => setConfirmForgot(true)} style={{ marginTop: 14, width: "100%", background: "none", border: "none", color: "#a39a89", fontSize: 12 }}>Esqueci minha senha</button>
        ) : (
          <div style={{ marginTop: 14, padding: 10, background: C.warnBg, borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: C.warn, marginBottom: 8 }}>Sem uma forma de recuperar a senha, a única saída é apagar todos os dados do app e começar do zero. Tem certeza?</div>
            <div style={{ display: "flex", gap: 8 }}>
              <GhostButton color={C.warn} onClick={onForgot}>Apagar tudo e recomeçar</GhostButton>
              <GhostButton onClick={() => setConfirmForgot(false)}>Cancelar</GhostButton>
            </div>
          </div>
        )}
      </Card>
    </AuthShell>
  );
}

/* ---------- Exportação SQL (Supabase) ---------- */
const escSql = (s) => (s === null || s === undefined ? "" : String(s).replace(/'/g, "''"));
const sqlStr = (s) => `'${escSql(s)}'`;
const sqlNum = (n) => (isNaN(n) ? 0 : n);

const sqlOrNull = (v) => (v === null || v === undefined || v === "" ? "null" : sqlStr(v));

function buildSupabaseSQL({ ingredients, products, lotes, partners, sales, prices, packaging, suppliers = [] }) {
  const lines = [];
  lines.push("-- Gerado pelo app de gestão Kemia · cole no SQL Editor do Supabase");
  lines.push("-- (o SQL de atualização precisa ter sido rodado antes: ele cria a tabela suppliers e as colunas novas)");
  lines.push("begin;");

  if (suppliers.length) {
    lines.push("\n-- Fornecedores");
    for (const s of suppliers) {
      lines.push(`insert into suppliers (id,name,category,contato) values (${sqlStr(s.id)},${sqlStr(s.name)},${sqlOrNull(s.category)},${sqlOrNull(s.contato)}) on conflict (id) do update set name=excluded.name, category=excluded.category, contato=excluded.contato;`);
    }
  }

  if (ingredients.length) {
    lines.push("\n-- Insumos");
    for (const i of ingredients) {
      lines.push(`insert into ingredients (id,name,unit,stock,avg_cost) values (${sqlStr(i.id)},${sqlStr(i.name)},${sqlStr(i.unit)},${sqlNum(i.stock)},${sqlNum(i.avgCost)}) on conflict (id) do update set name=excluded.name, unit=excluded.unit, stock=excluded.stock, avg_cost=excluded.avg_cost;`);
      (i.purchases || []).forEach((p, idx) => {
        lines.push(`insert into ingredient_purchases (id,ingredient_id,date,qty,value,unit_cost,supplier_id) values (${sqlStr(i.id + "_p" + idx)},${sqlStr(i.id)},${sqlStr(p.date)},${sqlNum(p.qty)},${sqlNum(p.value)},${sqlNum(p.unitCost)},${sqlOrNull(p.supplierId)}) on conflict (id) do nothing;`);
      });
    }
  }

  if (products.length) {
    lines.push("\n-- Produtos");
    for (const p of products) {
      const pack = packaging[p.id] || { frasco: 0, rotulo: 0 };
      lines.push(`insert into products (id,sigla,linha,name,unit_label,unit_size,unit_type,total_yield,price,frasco_cost,rotulo_cost,frasco_supplier_id,rotulo_supplier_id) values (${sqlStr(p.id)},${sqlStr(p.sigla)},${sqlStr(p.linha)},${sqlStr(p.name)},${sqlStr(p.unitLabel)},${sqlNum(p.unitSize)},${sqlStr(p.unitType)},${sqlNum(p.totalYield)},${sqlNum(prices[p.id] || 0)},${sqlNum(pack.frasco)},${sqlNum(pack.rotulo)},${sqlOrNull(pack.frascoSupplierId)},${sqlOrNull(pack.rotuloSupplierId)}) on conflict (id) do update set name=excluded.name, price=excluded.price;`);
      (p.items || []).forEach((it, idx) => {
        lines.push(`insert into product_items (id,product_id,ingredient_id,amount) values (${sqlStr(p.id + "_i" + idx)},${sqlStr(p.id)},${sqlStr(it.ing)},${sqlNum(it.amt)}) on conflict (id) do nothing;`);
      });
    }
  }

  if (lotes.length) {
    lines.push("\n-- Lotes");
    for (const l of lotes) {
      lines.push(`insert into lotes (id,code,product_id,qty,qty_remaining,date,total_cost,cost_per_unit) values (${sqlStr(l.id)},${sqlStr(l.code)},${sqlStr(l.productId)},${sqlNum(l.qty)},${sqlNum(l.qtyRemaining)},${sqlStr(l.date)},${sqlNum(l.totalCost)},${sqlNum(l.costPerUnit)}) on conflict (id) do nothing;`);
    }
  }

  if (partners.length) {
    lines.push("\n-- Parceiros");
    for (const pt of partners) {
      lines.push(`insert into partners (id,name,tipo,contato,endereco) values (${sqlStr(pt.id)},${sqlStr(pt.name)},${sqlStr(pt.tipo)},${sqlStr(pt.contato)},${sqlStr(pt.endereco)}) on conflict (id) do nothing;`);
    }
  }

  if (sales.length) {
    lines.push("\n-- Vendas");
    for (const s of sales) {
      lines.push(`insert into sales (id,date,product_id,lote_id,qty,unit_price,unit_cost,revenue,cost_of_goods,profit,canal,partner_id,paid,customer_name,paid_date) values (${sqlStr(s.id)},${sqlStr(s.date)},${sqlStr(s.productId)},${sqlStr(s.loteId)},${sqlNum(s.qty)},${sqlNum(s.unitPrice)},${sqlNum(s.unitCost)},${sqlNum(s.revenue)},${sqlNum(s.costOfGoods)},${sqlNum(s.profit)},${sqlStr(s.canal)},${s.partnerId ? sqlStr(s.partnerId) : "null"},${s.paid},${sqlOrNull(s.customerName)},${sqlOrNull(s.paidDate)}) on conflict (id) do nothing;`);
    }
  }

  lines.push("\ncommit;");
  return lines.join("\n");
}

function ExportSupabase({ ingredients, products, lotes, partners, sales, prices, packaging, suppliers }) {
  const [sql, setSql] = useState("");
  const [copied, setCopied] = useState(false);
  const isEmpty = ingredients.length === 0 && products.length === 0 && lotes.length === 0 && partners.length === 0 && sales.length === 0;

  const gerar = () => setSql(buildSupabaseSQL({ ingredients, products, lotes, partners, sales, prices, packaging, suppliers }));
  const copiar = async () => {
    try { await navigator.clipboard.writeText(sql); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };
  const baixar = () => {
    const blob = new Blob([sql], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "kemia_dados.sql"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: C.deep, marginBottom: 4 }}>Exportar dados para o Supabase</div>
      <div style={{ fontSize: 12.5, color: "#8a8171", marginBottom: 12 }}>
        Gera o SQL com tudo que você já cadastrou aqui, pronto pra colar no SQL Editor do Supabase (bate com as tabelas: ingredients, products, product_items, lotes, partners, sales).
      </div>
      {isEmpty ? (
        <Empty>Ainda não há dados cadastrados pra exportar.</Empty>
      ) : (
        <>
          <SolidButton onClick={gerar}><Layers size={14} /> Gerar SQL</SolidButton>
          {sql && (
            <div style={{ marginTop: 12 }}>
              <textarea readOnly value={sql} style={{ width: "100%", height: 160, fontFamily: "monospace", fontSize: 11.5, padding: 10, borderRadius: 8, border: `1px solid ${C.line}`, background: "#FAF7EF", color: C.ink }} />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <GhostButton onClick={copiar}>{copied ? "Copiado!" : "Copiar"}</GhostButton>
                <GhostButton onClick={baixar}>Baixar arquivo .sql</GhostButton>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/* ---------- Configurações ---------- */
function Configuracoes({ pin, onChangePin, onResetValores, onResetTudo, ingredients, products, lotes, partners, sales, prices, packaging, suppliers, adminPin, onChangeAdminPin, adminUnlocked, onLockAdmin, requestAdmin }) {
  const [novoPin1, setNovoPin1] = useState("");
  const [novoPin2, setNovoPin2] = useState("");
  const [pinMsg, setPinMsg] = useState(null);
  const [confirmValores, setConfirmValores] = useState(false);
  const [confirmTudo, setConfirmTudo] = useState(false);
  const [doneMsg, setDoneMsg] = useState(null);
  const [novoAdmin1, setNovoAdmin1] = useState("");
  const [novoAdmin2, setNovoAdmin2] = useState("");
  const [adminMsg, setAdminMsg] = useState(null);

  const salvarAdminPin = () => {
    if (novoAdmin1.length < 4) { setAdminMsg({ type: "err", text: "Use pelo menos 4 dígitos/caracteres." }); return; }
    if (novoAdmin1 !== novoAdmin2) { setAdminMsg({ type: "err", text: "Os dois campos não coincidem." }); return; }
    const salvar = () => { onChangeAdminPin(novoAdmin1); setNovoAdmin1(""); setNovoAdmin2(""); setAdminMsg({ type: "ok", text: "PIN de administrador salvo." }); };
    if (adminPin) requestAdmin(salvar)(); else salvar();
  };
  const removerAdminPin = requestAdmin(() => { onChangeAdminPin(null); setAdminMsg({ type: "ok", text: "PIN removido — as edições ficam livres pra quem tiver a senha do app." }); });

  const salvarPin = () => {
    if (novoPin1.length < 4) { setPinMsg({ type: "err", text: "Use pelo menos 4 dígitos/caracteres." }); return; }
    if (novoPin1 !== novoPin2) { setPinMsg({ type: "err", text: "As senhas não coincidem." }); return; }
    onChangePin(novoPin1);
    setNovoPin1(""); setNovoPin2("");
    setPinMsg({ type: "ok", text: "Senha atualizada." });
  };

  return (
    <div>
      <SectionTitle sub="Segurança de acesso, exportação de dados e limpeza do app.">Configurações</SectionTitle>

      <ExportSupabase ingredients={ingredients} products={products} lotes={lotes} partners={partners} sales={sales} prices={prices} packaging={packaging} suppliers={suppliers} />

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Lock size={15} color={C.deep} />
          <div style={{ fontWeight: 600, fontSize: 14, color: C.deep }}>Senha de acesso</div>
        </div>
        <div style={{ fontSize: 12.5, color: "#8a8171", marginBottom: 12 }}>
          Isso é uma trava simples de tela, guardada só neste app — protege contra quem abrir o link por cima do seu ombro, mas não é uma segurança de nível bancário.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input type="password" placeholder="Nova senha" value={novoPin1} onChange={(e) => setNovoPin1(e.target.value)} style={{ width: 150, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13.5 }} />
          <input type="password" placeholder="Confirmar" value={novoPin2} onChange={(e) => setNovoPin2(e.target.value)} style={{ width: 150, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13.5 }} />
          <SolidButton onClick={salvarPin}><Check size={14} /> Salvar senha</SolidButton>
        </div>
        {pinMsg && <div style={{ marginTop: 10, fontSize: 12.5, color: pinMsg.type === "ok" ? C.mid : C.warn }}>{pinMsg.text}</div>}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Lock size={15} color={C.gold} />
          <div style={{ fontWeight: 600, fontSize: 14, color: C.deep }}>PIN de administrador</div>
        </div>
        <div style={{ fontSize: 12.5, color: "#8a8171", marginBottom: 12 }}>
          Trava extra, separada da senha de entrada. Pede o PIN antes de ações sensíveis: editar nome/medida de insumo, apagar insumo, produto, parceiro, fornecedor ou lote, corrigir estoque de lote e zerar/apagar dados.
          {adminPin ? " Está ativo." : " Ainda não criado — sem ele, quem tiver a senha do app pode fazer essas alterações."}
          {" "}É uma trava de tela guardada neste aparelho, não segurança de banco de dados.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input type="password" placeholder={adminPin ? "Novo PIN de admin" : "Criar PIN de admin"} value={novoAdmin1} onChange={(e) => setNovoAdmin1(e.target.value)} style={{ width: 160, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13.5 }} />
          <input type="password" placeholder="Confirmar PIN de admin" value={novoAdmin2} onChange={(e) => setNovoAdmin2(e.target.value)} style={{ width: 160, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13.5 }} />
          <SolidButton bg={C.gold} onClick={salvarAdminPin}><Check size={14} /> Salvar PIN</SolidButton>
          {adminPin && adminUnlocked && <GhostButton onClick={onLockAdmin}><Lock size={13} /> Bloquear agora</GhostButton>}
          {adminPin && <GhostButton color={C.warn} onClick={removerAdminPin}>Remover trava</GhostButton>}
        </div>
        {adminMsg && <div style={{ marginTop: 10, fontSize: 12.5, color: adminMsg.type === "ok" ? C.mid : C.warn }}>{adminMsg.text}</div>}
      </Card>

      <Card style={{ borderColor: C.warn }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <AlertTriangle size={15} color={C.warn} />
          <div style={{ fontWeight: 600, fontSize: 14, color: C.warn }}>Zona de risco</div>
        </div>
        <div style={{ fontSize: 12.5, color: "#8a8171", marginBottom: 16 }}>Essas ações não podem ser desfeitas.</div>

        <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${C.line}` }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, marginBottom: 2 }}>Zerar valores</div>
          <div style={{ fontSize: 12.5, color: "#8a8171", marginBottom: 8 }}>Mantém insumos e produtos cadastrados, mas zera estoque, custo médio, preços, lotes, parceiros e vendas.</div>
          {!confirmValores ? (
            <GhostButton color={C.warn} onClick={requestAdmin(() => setConfirmValores(true))}>Zerar valores</GhostButton>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12.5, color: C.warn }}>Confirma?</span>
              <SolidButton bg={C.warn} onClick={() => { onResetValores(); setConfirmValores(false); setDoneMsg("Valores zerados."); }}>Sim, zerar</SolidButton>
              <GhostButton onClick={() => setConfirmValores(false)}>Cancelar</GhostButton>
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, marginBottom: 2 }}>Apagar tudo</div>
          <div style={{ fontSize: 12.5, color: "#8a8171", marginBottom: 8 }}>Remove também os insumos e produtos cadastrados — volta o app pra um estado completamente vazio.</div>
          {!confirmTudo ? (
            <GhostButton color={C.warn} onClick={requestAdmin(() => setConfirmTudo(true))}>Apagar tudo</GhostButton>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12.5, color: C.warn }}>Tem certeza? Isso apaga tudo.</span>
              <SolidButton bg={C.warn} onClick={() => { onResetTudo(); setConfirmTudo(false); setDoneMsg("Tudo apagado."); }}>Sim, apagar tudo</SolidButton>
              <GhostButton onClick={() => setConfirmTudo(false)}>Cancelar</GhostButton>
            </div>
          )}
        </div>

        {doneMsg && <div style={{ marginTop: 14, padding: "9px 12px", borderRadius: 8, fontSize: 13, background: "#E4EEE4", color: C.mid }}>{doneMsg}</div>}
      </Card>
    </div>
  );
}

/* ---------- Dashboard ---------- */
function Dashboard({ products, partners, sales, valorEstoqueInsumos, valorEstoqueProdutosCusto, valorEstoqueProdutosVenda, recebido, aReceber, lucroRealizado, semEstoque, stockByProduct, prices, lotes, productById, partnerById }) {
  const stat = (label, value, tone) => (
    <Card style={{ flex: "1 1 160px" }}>
      <div style={{ fontSize: 12, color: "#8a8171", marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 600, color: tone || C.deep }}>{value}</div>
    </Card>
  );

  // Produtos com mais saída
  const porProduto = products.map((p) => {
    const vendas = sales.filter((s) => s.productId === p.id);
    return {
      p,
      unidades: vendas.reduce((a, s) => a + s.qty, 0),
      receita: vendas.reduce((a, s) => a + s.revenue, 0),
      lucro: vendas.reduce((a, s) => a + s.profit, 0),
    };
  }).filter((r) => r.unidades > 0).sort((a, b) => b.unidades - a.unidades || b.receita - a.receita);
  const totalUnidades = porProduto.reduce((a, r) => a + r.unidades, 0);

  const porParceiro = partners.map((prt) => {
    const vendas = sales.filter((s) => s.partnerId === prt.id);
    const total = vendas.reduce((a, s) => a + s.revenue, 0);
    const pago = vendas.filter((s) => s.paid).reduce((a, s) => a + s.revenue, 0);
    return { prt, total, pago, pendente: total - pago };
  }).filter((r) => r.total > 0);

  // Clientes e recompra (vendas diretas com nome). Uma "compra" = um dia diferente de compra.
  const diretas = sales.filter((s) => s.canal !== "parceiro");
  const comNome = diretas.filter((s) => (s.customerName || "").trim());
  const semNome = diretas.length - comNome.length;
  const mapa = new Map();
  for (const s of comNome) {
    const k = norm(s.customerName);
    const c = mapa.get(k) || { nome: s.customerName.trim(), dias: new Set(), total: 0, ultima: "" };
    c.dias.add(s.date);
    c.total += s.revenue;
    if ((s.date || "") > c.ultima) c.ultima = s.date || "";
    mapa.set(k, c);
  }
  const clientes = [...mapa.values()].map((c) => ({ ...c, compras: c.dias.size })).sort((a, b) => b.compras - a.compras || b.total - a.total);
  const recorrentes = clientes.filter((c) => c.compras >= 2).length;
  const taxa = clientes.length ? Math.round((recorrentes / clientes.length) * 100) : 0;

  return (
    <div>
      <SectionTitle sub="Resumo financeiro completo do negócio.">Painel</SectionTitle>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        {stat("Recebido", brl(recebido), C.gold)}
        {stat("A receber", brl(aReceber), C.warn)}
        {stat("Lucro realizado", brl(lucroRealizado), lucroRealizado >= 0 ? C.mid : C.warn)}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        {stat("Capital em insumos", brl(valorEstoqueInsumos))}
        {stat("Estoque de produtos (custo)", brl(valorEstoqueProdutosCusto))}
        {stat("Estoque de produtos (venda)", brl(valorEstoqueProdutosVenda))}
      </div>

      {semEstoque.length > 0 && (
        <Card style={{ borderColor: C.warn, background: C.warnBg, marginBottom: 18 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <AlertTriangle size={18} color={C.warn} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 600, color: C.warn, fontSize: 14 }}>Insumos sem estoque</div>
              <div style={{ fontSize: 13, color: "#6b3a29", marginTop: 2 }}>{semEstoque.map((i) => i.name).join(", ")}</div>
            </div>
          </div>
        </Card>
      )}

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 14.5, color: C.deep, marginBottom: 10 }}>Produtos com mais saída</div>
        {porProduto.length === 0 ? <Empty>Nenhuma venda registrada ainda.</Empty> : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>#</th><th>Produto</th><th>Unidades</th><th>% das saídas</th><th>Receita</th><th>Lucro</th></tr></thead>
              <tbody>{porProduto.map((r, idx) => (
                <tr key={r.p.id}>
                  <td style={{ color: "#a39a89" }}>{idx + 1}</td>
                  <td>{r.p.name}</td>
                  <td style={{ fontWeight: 600 }}>{r.unidades}</td>
                  <td>{totalUnidades ? Math.round((r.unidades / totalUnidades) * 100) : 0}%</td>
                  <td>{brl(r.receita)}</td>
                  <td style={{ color: r.lucro >= 0 ? C.mid : C.warn, fontWeight: 600 }}>{brl(r.lucro)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 14.5, color: C.deep, marginBottom: 4 }}>Clientes e recompra</div>
        <div style={{ fontSize: 12, color: "#8a8171", marginBottom: 12 }}>
          Só vendas diretas com nome de cliente. Conta dias diferentes de compra (dois produtos no mesmo dia valem 1 compra).
          {semNome > 0 ? ` ${semNome} venda(s) sem nome ficam de fora.` : ""}
        </div>
        {clientes.length === 0 ? <Empty>Coloque o nome do cliente nas vendas pra acompanhar a recompra aqui.</Empty> : (
          <>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
              {stat("Clientes identificados", clientes.length)}
              {stat("Compraram 2+ vezes", recorrentes)}
              {stat("Taxa de recompra", `${taxa}%`, C.gold)}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead><tr><th>Cliente</th><th>Compras</th><th>Total gasto</th><th>Última compra</th></tr></thead>
                <tbody>{clientes.slice(0, 10).map((c) => (
                  <tr key={c.nome}>
                    <td>{c.nome}</td>
                    <td style={{ fontWeight: 600 }}>{c.compras}</td>
                    <td>{brl(c.total)}</td>
                    <td>{fmtDate(c.ultima)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 14.5, color: C.deep, marginBottom: 10 }}>Contas com parceiros comerciais</div>
        {porParceiro.length === 0 ? <Empty>Nenhuma entrega a parceiro registrada ainda.</Empty> : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Parceiro</th><th>Total entregue</th><th>Recebido</th><th>A receber</th></tr></thead>
              <tbody>{porParceiro.map((r) => (
                <tr key={r.prt.id}>
                  <td>{r.prt.name}</td><td>{brl(r.total)}</td><td>{brl(r.pago)}</td>
                  <td style={{ color: r.pendente > 0 ? C.warn : "#8a8171", fontWeight: r.pendente > 0 ? 700 : 400 }}>{brl(r.pendente)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <div style={{ fontWeight: 600, fontSize: 14.5, color: C.deep, marginBottom: 10 }}>Estoque de produtos prontos</div>
        {products.length === 0 ? <Empty>Nenhum produto cadastrado.</Empty> : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Produto</th><th>Unidades</th><th>Preço</th><th>Valor</th></tr></thead>
              <tbody>{products.map((p) => (
                <tr key={p.id}>
                  <td>{p.name} <span style={{ color: "#a39a89" }}>({p.unitLabel})</span></td>
                  <td>{stockByProduct[p.id] || 0}</td><td>{brl(prices[p.id] || 0)}</td>
                  <td>{brl((stockByProduct[p.id] || 0) * (prices[p.id] || 0))}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------- Insumos ---------- */
function IngredientRow({ i, setIngredients, onRemove, suppliers, supplierById, requestAdmin }) {
  const [buying, setBuying] = useState(false);
  const [pQty, setPQty] = useState("");
  const [pValue, setPValue] = useState("");
  const [pSupplier, setPSupplier] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [adjQty, setAdjQty] = useState(i.stock);
  const [histOpen, setHistOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [eName, setEName] = useState(i.name);
  const [eUnit, setEUnit] = useState(i.unit);

  const confirmarCompra = () => {
    const qty = num(pQty), value = num(pValue);
    if (qty <= 0) return;
    const unitCost = value / qty;
    const supplierId = pSupplier || null;
    setIngredients((prev) => prev.map((ing) => {
      if (ing.id !== i.id) return ing;
      const newStock = ing.stock + qty;
      const newAvg = newStock > 0 ? (ing.stock * ing.avgCost + value) / newStock : 0;
      const purchases = [...(ing.purchases || []), { date: todayLocal(), qty, value, unitCost, supplierId }];
      return { ...ing, stock: newStock, avgCost: newAvg, purchases };
    }));
    setPQty(""); setPValue(""); setPSupplier(""); setBuying(false);
  };

  const confirmarAjuste = () => {
    setIngredients((prev) => prev.map((ing) => ing.id === i.id ? { ...ing, stock: num(adjQty) } : ing));
    setAdjusting(false);
  };

  const salvarEdicao = () => {
    const name = eName.trim();
    if (!name) return;
    setIngredients((prev) => prev.map((ing) => (ing.id === i.id ? { ...ing, name, unit: eUnit } : ing)));
    setEditing(false);
  };

  const compareTone = (unitCost) => {
    if (!i.avgCost || i.stock === 0) return null;
    if (unitCost < i.avgCost) return { label: "mais barato que a média", color: C.mid };
    if (unitCost > i.avgCost) return { label: "mais caro que a média", color: C.warn };
    return { label: "igual à média", color: "#8a8171" };
  };
  const previewUnitCost = num(pQty) > 0 ? num(pValue) / num(pQty) : 0;
  const tone = buying && previewUnitCost > 0 ? compareTone(previewUnitCost) : null;
  const fechar = () => { setBuying(false); setAdjusting(false); setEditing(false); };

  return (
    <>
      <tr>
        <td style={{ minWidth: 150 }}>{i.name}</td>
        <td style={{ fontWeight: 600 }}>{qtyFmt(i.stock)} {i.unit}</td>
        <td style={{ color: C.gold, fontWeight: 600 }}>{brl(i.avgCost)}/{i.unit}</td>
        <td>{brl(i.stock * i.avgCost)}</td>
        <td>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={() => { fechar(); setBuying(true); }} style={{ background: "none", border: `1px solid ${C.deep}`, color: C.deep, borderRadius: 7, padding: "4px 9px", fontSize: 12, fontWeight: 600 }}>+ Compra</button>
            <button onClick={() => { fechar(); setAdjusting(true); }} style={{ background: "none", border: "none", color: "#a39a89", fontSize: 11.5 }}>ajustar</button>
            {(i.purchases || []).length > 0 && (
              <button onClick={() => setHistOpen((o) => !o)} style={{ background: "none", border: "none", color: "#a39a89", fontSize: 11.5 }}>histórico</button>
            )}
            <button aria-label={`Editar ${i.name}`} title="Editar nome e unidade" onClick={requestAdmin(() => { setEName(i.name); setEUnit(i.unit); fechar(); setEditing(true); })} style={{ background: "none", border: "none", color: "#a39a89" }}><Pencil size={14} /></button>
            <button aria-label={`Apagar ${i.name}`} title="Apagar insumo" onClick={requestAdmin(() => onRemove(i.id))} style={{ background: "none", border: "none", color: "#a39a89" }}><Trash2 size={14} /></button>
          </div>
        </td>
      </tr>
      {buying && (
        <tr>
          <td colSpan={5} style={{ background: "#FAF7EF" }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", padding: "6px 0" }}>
              <span style={{ fontSize: 12.5, color: "#6b6255" }}>Comprei</span>
              <NumInput value={pQty} onChange={setPQty} width={70} suffix={i.unit} />
              <span style={{ fontSize: 12.5, color: "#6b6255" }}>por (valor total)</span>
              <NumInput value={pValue} onChange={setPValue} width={80} />
              <Select value={pSupplier} onChange={setPSupplier} width={160}>
                <option value="">Fornecedor (opcional)</option>
                {sortByName(suppliers).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
              {tone && <Pill tone={tone.color} bg="transparent">{brl(previewUnitCost)}/{i.unit} — {tone.label}</Pill>}
              {!tone && previewUnitCost > 0 && <span style={{ fontSize: 12, color: "#8a8171" }}>{brl(previewUnitCost)}/{i.unit}</span>}
              <SolidButton onClick={confirmarCompra} bg={C.mid}><Check size={13} /> Adicionar ao estoque</SolidButton>
              <GhostButton onClick={() => setBuying(false)}>Cancelar</GhostButton>
            </div>
          </td>
        </tr>
      )}
      {adjusting && (
        <tr>
          <td colSpan={5} style={{ background: "#FAF7EF" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, color: "#6b6255" }}>Corrigir estoque atual para (contagem, quebra, perda — não altera o custo médio)</span>
              <NumInput value={adjQty} onChange={setAdjQty} width={70} suffix={i.unit} />
              <SolidButton onClick={confirmarAjuste} bg={C.deep}><Check size={13} /> Salvar</SolidButton>
              <GhostButton onClick={() => setAdjusting(false)}>Cancelar</GhostButton>
            </div>
          </td>
        </tr>
      )}
      {editing && (
        <tr>
          <td colSpan={5} style={{ background: "#FAF7EF" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, color: "#6b6255" }}>Nome</span>
              <TextInput value={eName} onChange={setEName} width={200} />
              <span style={{ fontSize: 12.5, color: "#6b6255" }}>Medida</span>
              <Select value={eUnit} onChange={setEUnit} width={70}><option value="ml">ml</option><option value="g">g</option></Select>
              <SolidButton onClick={salvarEdicao} bg={C.deep}><Check size={13} /> Salvar</SolidButton>
              <GhostButton onClick={() => setEditing(false)}>Cancelar</GhostButton>
            </div>
            {eUnit !== i.unit && (
              <div style={{ fontSize: 11.5, color: C.warn, paddingBottom: 6 }}>
                Trocar ml ↔ g só muda a etiqueta, não converte os números (estoque e custo ficam como estão). Se for o caso, corrija o estoque em "ajustar".
              </div>
            )}
          </td>
        </tr>
      )}
      {histOpen && (
        <tr>
          <td colSpan={5}>
            <div style={{ padding: "8px 0 4px", fontSize: 12.5 }}>
              {[...(i.purchases || [])].reverse().map((p, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", gap: 8, color: "#6b6255", borderBottom: `1px solid ${C.line}`, padding: "3px 0", flexWrap: "wrap" }}>
                  <span>
                    {fmtDate(p.date)} · {qtyFmt(p.qty)}{i.unit} por {brl(p.value)}
                    {p.supplierId && supplierById[p.supplierId] ? ` · ${supplierById[p.supplierId].name}` : ""}
                  </span>
                  <span>{brl(p.unitCost)}/{i.unit}</span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Insumos({ ingredients, setIngredients, costPerUnit, suppliers, supplierById, onRemove, requestAdmin }) {
  const [newIng, setNewIng] = useState({ name: "", unit: "ml", stock: "", value: "", supplier: "" });
  const [q, setQ] = useState("");
  const addIng = () => {
    if (!newIng.name.trim()) return;
    const stock = num(newIng.stock);
    const value = num(newIng.value);
    const avgCost = stock > 0 ? value / stock : 0;
    setIngredients((prev) => [...prev, {
      id: uid("custom"), name: newIng.name.trim(), unit: newIng.unit, stock, avgCost,
      purchases: stock > 0 ? [{ date: todayLocal(), qty: stock, value, unitCost: avgCost, supplierId: newIng.supplier || null }] : [],
    }]);
    setNewIng({ name: "", unit: "ml", stock: "", value: "", supplier: "" });
  };
  const total = ingredients.reduce((s, i) => s + i.stock * costPerUnit(i), 0);
  const visiveis = useMemo(
    () => sortByName(ingredients).filter((i) => !q.trim() || norm(i.name).includes(norm(q))),
    [ingredients, q]
  );

  return (
    <div>
      <SectionTitle sub="Cada nova compra se mistura ao estoque existente por custo médio ponderado — não sobrescreve o preço anterior.">Insumos</SectionTitle>
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 220px" }}>
            <Search size={14} color="#a39a89" style={{ position: "absolute", left: 10, top: 10 }} />
            <input
              type="search" placeholder="Buscar insumo…" value={q} onChange={(e) => setQ(e.target.value)}
              style={{ width: "100%", padding: "8px 10px 8px 30px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13.5, background: "#fff", color: C.ink }}
            />
          </div>
          <span style={{ fontSize: 12, color: "#8a8171" }}>
            {q.trim() ? `${visiveis.length} de ${ingredients.length}` : `${ingredients.length} insumo(s) · ordem alfabética`}
          </span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Insumo</th><th>Estoque</th><th>Custo médio</th><th>Valor</th><th></th></tr></thead>
            <tbody>
              {visiveis.map((i) => (
                <IngredientRow key={i.id} i={i} setIngredients={setIngredients} onRemove={onRemove}
                  suppliers={suppliers} supplierById={supplierById} requestAdmin={requestAdmin} />
              ))}
              {ingredients.length === 0 && <tr><td colSpan={5}><Empty>Nenhum insumo cadastrado.</Empty></td></tr>}
              {ingredients.length > 0 && visiveis.length === 0 && <tr><td colSpan={5}><Empty>Nenhum insumo encontrado para “{q}”.</Empty></td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ textAlign: "right", marginTop: 12, fontSize: 14, fontWeight: 600, color: C.deep }}>Valor total em estoque: {brl(total)}</div>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: C.deep, marginBottom: 10 }}>Adicionar novo insumo</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <TextInput placeholder="Nome do insumo" value={newIng.name} onChange={(v) => setNewIng({ ...newIng, name: v })} width={200} />
          <Select value={newIng.unit} onChange={(v) => setNewIng({ ...newIng, unit: v })}><option value="ml">ml</option><option value="g">g</option></Select>
          <input placeholder="Estoque inicial" type="number" value={newIng.stock} onChange={(e) => setNewIng({ ...newIng, stock: e.target.value })} style={{ width: 110, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13.5 }} />
          <input placeholder="Valor pago (total)" type="number" value={newIng.value} onChange={(e) => setNewIng({ ...newIng, value: e.target.value })} style={{ width: 130, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13.5 }} />
          <Select value={newIng.supplier} onChange={(v) => setNewIng({ ...newIng, supplier: v })} width={160}>
            <option value="">Fornecedor (opcional)</option>
            {sortByName(suppliers).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <SolidButton onClick={addIng}><Plus size={14} /> Adicionar</SolidButton>
        </div>
      </Card>
    </div>
  );
}

/* ---------- Fornecedores ---------- */
function Fornecedores({ suppliers, setSuppliers, ingredients, onRemove, requestAdmin }) {
  const [draft, setDraft] = useState({ name: "", category: "Insumo", contato: "" });
  const add = () => {
    if (!draft.name.trim()) return;
    setSuppliers((prev) => [...prev, { id: uid("sup"), name: draft.name.trim(), category: draft.category, contato: draft.contato.trim() }]);
    setDraft({ name: "", category: "Insumo", contato: "" });
  };
  const update = (id, field, v) => setSuppliers((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: v } : s)));
  const gasto = (id) => ingredients.reduce((a, ing) => a + (ing.purchases || []).filter((p) => p.supplierId === id).reduce((b, p) => b + p.value, 0), 0);
  const compras = (id) => ingredients.reduce((a, ing) => a + (ing.purchases || []).filter((p) => p.supplierId === id).length, 0);

  return (
    <div>
      <SectionTitle sub="Onde você compra insumos, rótulos e embalagens. Escolha o fornecedor na hora da compra e no custo de embalagem da Produção.">Fornecedores</SectionTitle>

      {suppliers.length === 0 ? (
        <Card style={{ marginBottom: 16 }}><Empty>Nenhum fornecedor cadastrado ainda.</Empty></Card>
      ) : suppliers.map((s) => (
        <Card key={s.id} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <TextInput value={s.name} onChange={(v) => update(s.id, "name", v)} width={170} />
              <Select value={s.category} onChange={(v) => update(s.id, "category", v)}>
                {SUPPLIER_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
              <TextInput value={s.contato} onChange={(v) => update(s.id, "contato", v)} width={150} placeholder="Whatsapp/contato" />
            </div>
            <button aria-label={`Apagar ${s.name}`} onClick={requestAdmin(() => onRemove(s.id))} style={{ background: "none", border: "none", color: C.warn }}><Trash2 size={16} /></button>
          </div>
          <div style={{ marginTop: 8, fontSize: 12.5, color: "#8a8171" }}>
            {compras(s.id)} compra(s) de insumo registradas · <b style={{ color: C.deep }}>{brl(gasto(s.id))}</b>
          </div>
        </Card>
      ))}

      <Card style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: C.deep, marginBottom: 10 }}>Novo fornecedor</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <TextInput placeholder="Nome do fornecedor" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} width={200} />
          <Select value={draft.category} onChange={(v) => setDraft({ ...draft, category: v })}>
            {SUPPLIER_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <TextInput placeholder="Whatsapp/contato" value={draft.contato} onChange={(v) => setDraft({ ...draft, contato: v })} width={150} />
          <SolidButton onClick={add}><Plus size={14} /> Adicionar fornecedor</SolidButton>
        </div>
      </Card>
    </div>
  );
}

/* ---------- Produtos ---------- */
function emptyNewProduct() { return { name: "", sigla: "", linha: "", unitLabel: "", unitSize: "", unitType: "ml", totalYield: "", items: [] }; }

function Produtos({ products, setProducts, ingredients, removeProduct, requestAdmin }) {
  const [expanded, setExpanded] = useState(null);
  const [draft, setDraft] = useState(emptyNewProduct());
  const [filtroLinha, setFiltroLinha] = useState("Todas");
  const [factors, setFactors] = useState({});

  const linhas = ["Todas", ...Array.from(new Set(products.map((p) => p.linha || "Geral")))];
  const visiveis = filtroLinha === "Todas" ? products : products.filter((p) => (p.linha || "Geral") === filtroLinha);

  const updateProduct = (id, field, value) => setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: ["name", "unitLabel", "unitType", "sigla", "linha"].includes(field) ? value : num(value) } : p)));
  const updateItem = (pid, idx, field, value) => setProducts((prev) => prev.map((p) => p.id !== pid ? p : { ...p, items: p.items.map((it, i) => i === idx ? { ...it, [field]: field === "ing" ? value : num(value) } : it) }));
  const addItem = (pid) => setProducts((prev) => prev.map((p) => p.id === pid ? { ...p, items: [...p.items, { ing: sortByName(ingredients)[0]?.id || "", amt: 0 }] } : p));
  const removeItem = (pid, idx) => setProducts((prev) => prev.map((p) => p.id === pid ? { ...p, items: p.items.filter((_, i) => i !== idx) } : p));
  const scaleRecipe = (pid, factor) => {
    if (!factor || factor <= 0) return;
    setProducts((prev) => prev.map((p) => p.id !== pid ? p : {
      ...p,
      totalYield: +(p.totalYield * factor).toFixed(4),
      items: p.items.map((it) => ({ ...it, amt: +(it.amt * factor).toFixed(4) })),
    }));
  };

  const draftAddItem = () => setDraft((d) => ({ ...d, items: [...d.items, { ing: sortByName(ingredients)[0]?.id || "", amt: 0 }] }));
  const draftUpdateItem = (idx, field, value) => setDraft((d) => ({ ...d, items: d.items.map((it, i) => i === idx ? { ...it, [field]: field === "ing" ? value : num(value) } : it) }));
  const draftRemoveItem = (idx) => setDraft((d) => ({ ...d, items: d.items.filter((_, i) => i !== idx) }));

  const createProduct = () => {
    if (!draft.name.trim() || !draft.unitLabel.trim()) return;
    const id = uid("prod");
    setProducts((prev) => [...prev, {
      id, name: draft.name.trim(), sigla: (draft.sigla.trim() || autoSigla(draft.name)).toUpperCase(),
      linha: draft.linha.trim() || "Geral", unitLabel: draft.unitLabel.trim(),
      unitSize: num(draft.unitSize) || 1, unitType: draft.unitType, totalYield: num(draft.totalYield) || num(draft.unitSize) || 1,
      items: draft.items.filter((it) => it.ing),
    }]);
    setDraft(emptyNewProduct());
  };

  return (
    <div>
      <SectionTitle sub="Cadastre produtos de qualquer linha, com sigla (usada no código do lote) e a fórmula de cada um.">Produtos</SectionTitle>

      {products.length > 0 && (
        <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "#8a8171" }}>Linha:</span>
          <Select value={filtroLinha} onChange={setFiltroLinha} width={180}>
            {linhas.map((l) => <option key={l} value={l}>{l}</option>)}
          </Select>
        </div>
      )}

      {visiveis.length === 0 && <Card style={{ marginBottom: 16 }}><Empty>Nenhum produto nessa linha ainda.</Empty></Card>}

      {visiveis.map((p) => {
        const open = expanded === p.id;
        return (
          <Card key={p.id} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Pill tone={C.deep} bg={C.tan}>{p.sigla}</Pill>
                <TextInput value={p.name} onChange={(v) => updateProduct(p.id, "name", v)} width={170} />
                <TextInput value={p.linha} onChange={(v) => updateProduct(p.id, "linha", v)} width={130} placeholder="Linha" />
                <TextInput value={p.unitLabel} onChange={(v) => updateProduct(p.id, "unitLabel", v)} width={70} placeholder="ex: 100ml" />
                <Select value={p.unitType} onChange={(v) => updateProduct(p.id, "unitType", v)}><option value="ml">ml</option><option value="g">g</option></Select>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setExpanded(open ? null : p.id)} style={{ background: "none", border: "none", color: C.deep }}>{open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>
                <button aria-label={`Apagar ${p.name}`} onClick={requestAdmin(() => removeProduct(p.id))} style={{ background: "none", border: "none", color: C.warn }}><Trash2 size={16} /></button>
              </div>
            </div>

            {open && (
              <div style={{ marginTop: 14, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
                <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 13, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ color: "#8a8171" }}>Sigla do lote</span>
                  <TextInput value={p.sigla} onChange={(v) => updateProduct(p.id, "sigla", v.toUpperCase())} width={60} />
                  <span style={{ color: "#8a8171" }}>Tamanho da unidade</span>
                  <NumInput value={p.unitSize} onChange={(v) => updateProduct(p.id, "unitSize", v)} width={70} suffix={p.unitType} />
                  <span style={{ color: "#8a8171" }}>Rendimento total da receita</span>
                  <NumInput value={p.totalYield} onChange={(v) => updateProduct(p.id, "totalYield", v)} width={70} suffix={p.unitType} />
                </div>

                <div style={{ fontSize: 13, fontWeight: 600, color: C.deep, marginBottom: 6 }}>Fórmula (insumos da receita)</div>
                {p.items.map((it, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                    <Select value={it.ing} onChange={(v) => updateItem(p.id, idx, "ing", v)} width={"1 1 160px"}>
                      {sortByName(ingredients).map((ing) => <option key={ing.id} value={ing.id}>{ing.name}</option>)}
                    </Select>
                    <NumInput value={it.amt} onChange={(v) => updateItem(p.id, idx, "amt", v)} width={70} suffix={ingredients.find((i) => i.id === it.ing)?.unit} />
                    <button onClick={() => removeItem(p.id, idx)} style={{ background: "none", border: "none", color: "#a39a89" }}><Trash2 size={14} /></button>
                  </div>
                ))}
                <GhostButton onClick={() => addItem(p.id)}><Plus size={13} /> Adicionar insumo à fórmula</GhostButton>

                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
                  <span style={{ fontSize: 12.5, color: "#8a8171" }}>Multiplicar receita inteira por</span>
                  <NumInput value={factors[p.id] ?? 2} onChange={(v) => setFactors((f) => ({ ...f, [p.id]: v }))} width={55} />
                  <GhostButton color={C.gold} onClick={() => scaleRecipe(p.id, num(factors[p.id] ?? 2))}>Aplicar</GhostButton>
                </div>
              </div>
            )}
          </Card>
        );
      })}

      <Card style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: C.deep, marginBottom: 10 }}>Novo produto</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <TextInput placeholder="Nome do produto" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} width={190} />
          <TextInput placeholder="Sigla (ex: TON)" value={draft.sigla} onChange={(v) => setDraft({ ...draft, sigla: v.toUpperCase() })} width={100} />
          <TextInput placeholder="Linha (ex: Skincare)" value={draft.linha} onChange={(v) => setDraft({ ...draft, linha: v })} width={150} />
          <TextInput placeholder="Rótulo (ex: 100ml)" value={draft.unitLabel} onChange={(v) => setDraft({ ...draft, unitLabel: v })} width={100} />
          <Select value={draft.unitType} onChange={(v) => setDraft({ ...draft, unitType: v })}><option value="ml">ml</option><option value="g">g</option></Select>
          <input placeholder="Tam. da unidade" type="number" value={draft.unitSize} onChange={(e) => setDraft({ ...draft, unitSize: e.target.value })} style={{ width: 120, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13.5 }} />
          <input placeholder="Rendimento total receita" type="number" value={draft.totalYield} onChange={(e) => setDraft({ ...draft, totalYield: e.target.value })} style={{ width: 160, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13.5 }} />
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, color: C.deep, marginBottom: 6 }}>Fórmula</div>
        {draft.items.map((it, idx) => (
          <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <Select value={it.ing} onChange={(v) => draftUpdateItem(idx, "ing", v)} width={"1 1 160px"}>
              {sortByName(ingredients).map((ing) => <option key={ing.id} value={ing.id}>{ing.name}</option>)}
            </Select>
            <NumInput value={it.amt} onChange={(v) => draftUpdateItem(idx, "amt", v)} width={70} suffix={ingredients.find((i) => i.id === it.ing)?.unit} />
            <button onClick={() => draftRemoveItem(idx)} style={{ background: "none", border: "none", color: "#a39a89" }}><Trash2 size={14} /></button>
          </div>
        ))}
        <GhostButton onClick={draftAddItem}><Plus size={13} /> Adicionar insumo</GhostButton>
        <div style={{ marginTop: 14 }}><SolidButton onClick={createProduct} bg={C.gold}><Plus size={15} /> Criar produto</SolidButton></div>
      </Card>
    </div>
  );
}

/* ---------- Producao (gera lotes) ---------- */
function Producao({ products, ingredients, setIngredients, ingById, costPerUnit, packaging, setPackaging, lotes, setLotes, suppliers }) {
  const [productId, setProductId] = useState(products[0]?.id || "");
  const [qty, setQty] = useState(10);
  const [ignoreStock, setIgnoreStock] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => { if (!products.find((p) => p.id === productId)) setProductId(products[0]?.id || ""); }, [products]);

  const recipe = products.find((p) => p.id === productId);
  if (!recipe) {
    return (
      <div>
        <SectionTitle sub="Escolha o produto e a quantidade — calcula insumos, custo, e gera um lote rastreável.">Produção</SectionTitle>
        <Card><Empty>Cadastre um produto na aba "Produtos" antes de produzir um lote.</Empty></Card>
      </div>
    );
  }

  const pack = packaging[productId] || { frasco: 0, rotulo: 0 };
  const rows = recipe.items.map((it) => {
    const ing = ingById[it.ing];
    const perUnit = recipe.totalYield ? (it.amt / recipe.totalYield) * recipe.unitSize : 0;
    const needed = perUnit * qty;
    const available = ing ? ing.stock : 0;
    const shortfall = Math.max(0, needed - available);
    const lineCost = needed * (ing ? costPerUnit(ing) : 0);
    return { ...it, ing, needed, available, shortfall, lineCost };
  });

  const mpCost = rows.reduce((s, r) => s + r.lineCost, 0);
  const embCost = (num(pack.frasco) + num(pack.rotulo)) * qty;
  const totalCost = mpCost + embCost;
  const costPerUnitTotal = qty > 0 ? totalCost / qty : 0;
  const hasShortfall = rows.some((r) => r.shortfall > 0);
  const previewCode = nextLoteCode(recipe, lotes);

  const confirmarProducao = () => {
    if (hasShortfall && !ignoreStock) {
      setMsg({ type: "err", text: "Estoque insuficiente para essa produção. Ajuste o estoque de insumos ou marque 'produzir mesmo assim'." });
      return;
    }
    setIngredients((prev) => prev.map((i) => {
      const row = rows.find((r) => r.ing && r.ing.id === i.id);
      return row ? { ...i, stock: Math.max(0, i.stock - row.needed) } : i;
    }));
    const code = nextLoteCode(recipe, lotes);
    setLotes((prev) => [...prev, { id: uid("lote"), code, productId, qty, qtyRemaining: qty, date: todayLocal(), totalCost, costPerUnit: costPerUnitTotal }]);
    setMsg({ type: "ok", text: `Lote ${code} registrado com ${qty} un de ${recipe.name}.` });
  };

  return (
    <div>
      <SectionTitle sub="Escolha o produto e a quantidade — calcula insumos, custo, e gera um lote rastreável.">Produção</SectionTitle>
      <Card>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <Select value={productId} onChange={(v) => { setProductId(v); setMsg(null); }} width={"1 1 200px"}>
            {products.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.unitLabel})</option>)}
          </Select>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: "#8a8171" }}>Quantidade (un)</span>
            <NumInput value={qty} onChange={(v) => setQty(num(v))} width={70} />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}><Pill tone={C.deep} bg={C.tan}>Próximo lote: {previewCode}</Pill></div>

        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Insumo</th><th>Necessário</th><th>Estoque</th><th>Falta</th><th>Custo</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.ing ? r.ing.name : "(insumo não cadastrado)"}</td>
                  <td>{qtyFmt(r.needed)} {r.ing?.unit}</td>
                  <td>{qtyFmt(r.available)} {r.ing?.unit}</td>
                  <td style={{ color: r.shortfall > 0 ? C.warn : "#8a8171", fontWeight: r.shortfall > 0 ? 700 : 400 }}>{r.shortfall > 0 ? `-${qtyFmt(r.shortfall)}` : "—"}</td>
                  <td>{brl(r.lineCost)}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5}><Empty>Esse produto ainda não tem fórmula cadastrada.</Empty></td></tr>}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 14, padding: "12px 0", borderTop: `1px solid ${C.line}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#8a8171" }}>Frasco/embalagem por un.</span>
            <NumInput value={pack.frasco} onChange={(v) => setPackaging((p) => ({ ...p, [productId]: { ...p[productId], frasco: num(v) } }))} width={64} />
            <Select value={pack.frascoSupplierId || ""} onChange={(v) => setPackaging((p) => ({ ...p, [productId]: { ...p[productId], frascoSupplierId: v } }))} width={150}>
              <option value="">Fornecedor (opcional)</option>
              {sortByName(suppliers).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#8a8171" }}>Rótulo por un.</span>
            <NumInput value={pack.rotulo} onChange={(v) => setPackaging((p) => ({ ...p, [productId]: { ...p[productId], rotulo: num(v) } }))} width={64} />
            <Select value={pack.rotuloSupplierId || ""} onChange={(v) => setPackaging((p) => ({ ...p, [productId]: { ...p[productId], rotuloSupplierId: v } }))} width={150}>
              <option value="">Fornecedor (opcional)</option>
              {sortByName(suppliers).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
          <div style={{ fontSize: 13, color: "#6b6255" }}>Matéria-prima: <b>{brl(mpCost)}</b> · Embalagem: <b>{brl(embCost)}</b></div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.deep }}>Total: {brl(totalCost)} <span style={{ fontSize: 12.5, fontWeight: 500, color: "#8a8171" }}>({brl(costPerUnitTotal)}/un)</span></div>
        </div>

        {hasShortfall && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, fontSize: 13, color: C.warn }}>
            <input type="checkbox" checked={ignoreStock} onChange={(e) => setIgnoreStock(e.target.checked)} />
            Produzir mesmo com estoque insuficiente (permite estoque negativo)
          </label>
        )}

        {msg && <div style={{ marginTop: 12, padding: "9px 12px", borderRadius: 8, fontSize: 13, background: msg.type === "ok" ? "#E4EEE4" : C.warnBg, color: msg.type === "ok" ? C.mid : C.warn }}>{msg.text}</div>}
        <div style={{ marginTop: 14 }}><SolidButton onClick={confirmarProducao} full><Check size={16} /> Registrar lote</SolidButton></div>
      </Card>

      <RecipeReference recipe={recipe} ingById={ingById} />
    </div>
  );
}

function RecipeReference({ recipe, ingById }) {
  const [open, setOpen] = useState(false);
  return (
    <Card style={{ marginTop: 16 }}>
      <button onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", fontSize: 13.5, fontWeight: 600, color: C.deep }}>
        Ver receita base cadastrada ({recipe.totalYield}{recipe.unitType})
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 13, color: "#6b6255" }}>{recipe.items.map((it, i) => <li key={i}>{ingById[it.ing]?.name || it.ing}: {qtyFmt(it.amt)}{ingById[it.ing]?.unit || ""}</li>)}</ul>}
    </Card>
  );
}

/* ---------- Estoque (por lote) ---------- */
function Estoque({ products, lotes, setLotes, prices, setPrices, stockByProduct, sales, onRemoveLote, requestAdmin }) {
  const [expanded, setExpanded] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);

  const setRemaining = (id, v) => setLotes((prev) => prev.map((l) => (l.id === id ? { ...l, qtyRemaining: Math.max(0, num(v)) } : l)));
  const sortedLotes = (list) => [...list].sort((a, b) => (b.date || "").localeCompare(a.date || "") || idStamp(b.id) - idStamp(a.id));

  return (
    <div>
      <SectionTitle sub="Estoque por produto e o detalhe de cada lote. Editar quantidade e apagar lote são ações protegidas.">Estoque</SectionTitle>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Produto</th><th>Estoque</th><th>Preço venda</th><th>Valor</th></tr></thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>{p.name} <span style={{ color: "#a39a89" }}>({p.unitLabel})</span></td>
                  <td style={{ fontWeight: 600 }}>{stockByProduct[p.id] || 0}</td>
                  <td><NumInput value={prices[p.id] ?? 0} onChange={(v) => setPrices((pr) => ({ ...pr, [p.id]: num(v) }))} width={70} /></td>
                  <td>{brl((stockByProduct[p.id] || 0) * (prices[p.id] || 0))}</td>
                </tr>
              ))}
              {products.length === 0 && <tr><td colSpan={4}><Empty>Nenhum produto cadastrado.</Empty></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {products.map((p) => {
        const ls = lotes.filter((l) => l.productId === p.id);
        if (ls.length === 0) return null;
        const open = expanded === p.id;
        return (
          <Card key={p.id} style={{ marginBottom: 10 }}>
            <button onClick={() => setExpanded(open ? null : p.id)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", fontSize: 13.5, fontWeight: 600, color: C.deep }}>
              Lotes de {p.name} ({ls.length}) {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {open && (
              <div style={{ overflowX: "auto", marginTop: 10 }}>
                <table>
                  <thead><tr><th>Código do lote</th><th>Data</th><th>Produzido</th><th>Restante</th><th>Custo/un</th><th></th></tr></thead>
                  <tbody>{sortedLotes(ls).map((l) => {
                    const nSales = sales.filter((s) => s.loteId === l.id).length;
                    return (
                      <Fragment key={l.id}>
                        <tr>
                          <td><Pill tone={C.deep} bg={C.tan}>{l.code}</Pill></td>
                          <td>{fmtDate(l.date)}</td>
                          <td>{l.qty}</td>
                          <td style={{ color: l.qtyRemaining === 0 ? "#a39a89" : C.mid, fontWeight: 600 }}>
                            {editingId === l.id
                              ? <NumInput value={l.qtyRemaining} onChange={(v) => setRemaining(l.id, v)} width={64} />
                              : l.qtyRemaining}
                          </td>
                          <td>{brl(l.costPerUnit)}</td>
                          <td>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              {editingId === l.id ? (
                                <button aria-label={`Concluir edição ${l.code}`} onClick={() => setEditingId(null)} style={{ background: "none", border: "none", color: C.mid }}><Check size={15} /></button>
                              ) : (
                                <button aria-label={`Editar quantidade ${l.code}`} title="Corrigir quantidade restante" onClick={requestAdmin(() => { setConfirmId(null); setEditingId(l.id); })} style={{ background: "none", border: "none", color: "#a39a89" }}><Pencil size={14} /></button>
                              )}
                              <button aria-label={`Apagar lote ${l.code}`} title="Apagar lote" onClick={requestAdmin(() => { setEditingId(null); setConfirmId(l.id); })} style={{ background: "none", border: "none", color: "#a39a89" }}><Trash2 size={14} /></button>
                            </div>
                          </td>
                        </tr>
                        {confirmId === l.id && (
                          <tr>
                            <td colSpan={6} style={{ background: C.warnBg }}>
                              <div style={{ padding: "6px 0", fontSize: 12.5, color: C.warn }}>
                                Apagar o lote {l.code}?
                                {nSales > 0 ? ` Ele tem ${nSales} venda(s) registrada(s) — elas também serão apagadas.` : ""}
                                {" "}Isso não devolve os insumos ao estoque.
                              </div>
                              <div style={{ display: "flex", gap: 8, paddingBottom: 6 }}>
                                <SolidButton bg={C.warn} onClick={() => { setConfirmId(null); onRemoveLote(l.id); }}>Sim, apagar lote</SolidButton>
                                <GhostButton onClick={() => setConfirmId(null)}>Cancelar</GhostButton>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}</tbody>
                </table>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/* ---------- Parceiros ---------- */
function Parceiros({ partners, setPartners, sales, productById, onRemove, requestAdmin }) {
  const [draft, setDraft] = useState({ name: "", contato: "", tipo: PARTNER_TYPES[0], endereco: "", obs: "" });

  const addPartner = () => {
    if (!draft.name.trim()) return;
    setPartners((prev) => [...prev, { id: uid("partner"), ...draft, name: draft.name.trim() }]);
    setDraft({ name: "", contato: "", tipo: PARTNER_TYPES[0], endereco: "", obs: "" });
  };
  const updateField = (id, field, value) => setPartners((prev) => prev.map((p) => p.id === id ? { ...p, [field]: value } : p));

  return (
    <div>
      <SectionTitle sub="Lojas, salões e revendedores que recebem seus produtos para comercializar.">Parceiros comerciais</SectionTitle>

      {partners.length === 0 ? (
        <Card style={{ marginBottom: 16 }}><Empty>Nenhum parceiro cadastrado ainda.</Empty></Card>
      ) : (
        partners.map((p) => {
          const vendas = sales.filter((s) => s.partnerId === p.id);
          const total = vendas.reduce((a, s) => a + s.revenue, 0);
          const pendente = vendas.filter((s) => !s.paid).reduce((a, s) => a + s.revenue, 0);
          return (
            <Card key={p.id} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <TextInput value={p.name} onChange={(v) => updateField(p.id, "name", v)} width={160} />
                  <Select value={p.tipo} onChange={(v) => updateField(p.id, "tipo", v)}>{PARTNER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select>
                  <TextInput value={p.contato} onChange={(v) => updateField(p.id, "contato", v)} width={140} placeholder="Whatsapp/contato" />
                </div>
                <button aria-label={`Apagar ${p.name}`} onClick={requestAdmin(() => onRemove(p.id))} style={{ background: "none", border: "none", color: C.warn }}><Trash2 size={16} /></button>
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 16, fontSize: 12.5, color: "#8a8171" }}>
                <span>Total entregue: <b style={{ color: C.deep }}>{brl(total)}</b></span>
                {pendente > 0 && <span>A receber: <b style={{ color: C.warn }}>{brl(pendente)}</b></span>}
              </div>
            </Card>
          );
        })
      )}

      <Card style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: C.deep, marginBottom: 10 }}>Novo parceiro</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <TextInput placeholder="Nome do parceiro/loja" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} width={190} />
          <Select value={draft.tipo} onChange={(v) => setDraft({ ...draft, tipo: v })}>{PARTNER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select>
          <TextInput placeholder="Whatsapp/contato" value={draft.contato} onChange={(v) => setDraft({ ...draft, contato: v })} width={150} />
          <TextInput placeholder="Endereço (opcional)" value={draft.endereco} onChange={(v) => setDraft({ ...draft, endereco: v })} width={190} />
          <SolidButton onClick={addPartner}><Plus size={14} /> Adicionar parceiro</SolidButton>
        </div>
      </Card>
    </div>
  );
}

/* ---------- Vendas ---------- */
function Vendas({ products, lotes, setLotes, prices, partners, sales, setSales, productById, partnerById }) {
  const [productId, setProductId] = useState(products[0]?.id || "");
  const [loteId, setLoteId] = useState("");
  const [qty, setQty] = useState(1);
  const [unitPrice, setUnitPrice] = useState(prices[products[0]?.id] || 0);
  const [canal, setCanal] = useState("direta");
  const [partnerId, setPartnerId] = useState(partners[0]?.id || "");
  const [paid, setPaid] = useState(true);
  const [customer, setCustomer] = useState("");
  const [saleDate, setSaleDate] = useState(todayLocal());
  const [payDate, setPayDate] = useState(todayLocal());
  const [statusFilter, setStatusFilter] = useState("todos");
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState(null);

  useEffect(() => { if (!products.find((p) => p.id === productId)) setProductId(products[0]?.id || ""); }, [products]);
  useEffect(() => { if (!partners.find((p) => p.id === partnerId)) setPartnerId(partners[0]?.id || ""); }, [partners]);

  const lotesDisponiveis = lotes.filter((l) => l.productId === productId && l.qtyRemaining > 0);
  useEffect(() => {
    if (!lotesDisponiveis.find((l) => l.id === loteId)) setLoteId(lotesDisponiveis[0]?.id || "");
  }, [productId, lotes]);

  useEffect(() => { setPaid(canal === "direta"); }, [canal]);

  const loteAtual = lotes.find((l) => l.id === loteId);
  const nomesConhecidos = useMemo(
    () => [...new Set(sales.map((s) => (s.customerName || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [sales]
  );

  const registrarVenda = () => {
    if (!productId || qty <= 0) return;
    if (!loteAtual) { setMsg({ type: "err", text: "Nenhum lote com estoque disponível para esse produto." }); return; }
    if (qty > loteAtual.qtyRemaining) { setMsg({ type: "err", text: `Esse lote só tem ${loteAtual.qtyRemaining} unidade(s) restante(s).` }); return; }
    if (canal === "parceiro" && !partnerId) { setMsg({ type: "err", text: "Selecione um parceiro comercial." }); return; }
    const nome = customer.trim();
    if (canal === "direta" && !paid && !nome) {
      setMsg({ type: "err", text: "Venda a prazo precisa do nome do cliente — é assim que você sabe de quem cobrar." });
      return;
    }
    const data = saleDate || todayLocal();
    const revenue = qty * unitPrice;
    const cost = qty * loteAtual.costPerUnit;
    setSales((prev) => [...prev, {
      id: uid("sale"), date: data, productId, loteId, qty, unitPrice, unitCost: loteAtual.costPerUnit,
      revenue, costOfGoods: cost, profit: revenue - cost, canal, partnerId: canal === "parceiro" ? partnerId : null,
      paid, paidDate: paid ? data : null, customerName: canal === "direta" ? nome : "",
    }]);
    setLotes((prev) => prev.map((l) => (l.id === loteId ? { ...l, qtyRemaining: l.qtyRemaining - qty } : l)));
    setMsg({ type: "ok", text: `Registrado: ${qty} un (lote ${loteAtual.code}) por ${brl(unitPrice)} cada${nome ? ` · ${nome}` : ""}${paid ? "" : " · a receber"}.` });
    setQty(1);
    setCustomer("");
  };

  const darBaixa = (ids) => {
    const d = payDate || todayLocal();
    setSales((prev) => prev.map((s) => (ids.includes(s.id) ? { ...s, paid: true, paidDate: d } : s)));
  };

  const nomeDoComprador = (s) => (s.canal === "parceiro" ? `${partnerById[s.partnerId]?.name || "Parceiro"} (parceiro)` : ((s.customerName || "").trim() || "—"));

  // A receber, agrupado por cliente
  const grupos = useMemo(() => {
    const m = new Map();
    for (const s of sales.filter((x) => !x.paid)) {
      const key = s.canal === "parceiro" ? `p:${s.partnerId}` : `c:${norm(s.customerName)}`;
      const g = m.get(key) || { nome: s.canal === "parceiro" ? `${partnerById[s.partnerId]?.name || "Parceiro"} (parceiro)` : ((s.customerName || "").trim() || "(sem nome)"), itens: [], total: 0 };
      g.itens.push(s);
      g.total += s.revenue;
      m.set(key, g);
    }
    for (const g of m.values()) g.itens.sort((a, b) => (a.date || "").localeCompare(b.date || "") || idStamp(a.id) - idStamp(b.id));
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [sales, partnerById]);
  const totalReceber = grupos.reduce((a, g) => a + g.total, 0);

  const historico = useMemo(() => {
    const q = norm(search);
    return [...sales]
      .filter((s) => statusFilter === "todos" || (statusFilter === "receber" ? !s.paid : s.paid))
      .filter((s) => !q || norm([s.customerName, productById[s.productId]?.name, s.canal === "parceiro" ? partnerById[s.partnerId]?.name : ""].join(" ")).includes(q))
      .sort((a, b) => (b.date || "").localeCompare(a.date || "") || idStamp(b.id) - idStamp(a.id));
  }, [sales, statusFilter, search, productById, partnerById]);

  const totals = sales.reduce((a, s) => ({
    revenue: a.revenue + (s.paid ? s.revenue : 0),
    profit: a.profit + (s.paid ? s.profit : 0),
    pendente: a.pendente + (s.paid ? 0 : s.revenue),
  }), { revenue: 0, profit: 0, pendente: 0 });

  const inputStyle = { padding: "6px 8px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13.5, fontFamily: "inherit", background: "#fff", color: C.ink };

  return (
    <div>
      <SectionTitle sub="Venda direta ou entrega a parceiro, sempre saindo de um lote. Venda a prazo fica em “A receber” até você dar baixa.">Vendas</SectionTitle>
      <Card>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <GhostButton onClick={() => setCanal("direta")} color={canal === "direta" ? C.gold : C.tan}>Venda direta</GhostButton>
          <GhostButton onClick={() => setCanal("parceiro")} color={canal === "parceiro" ? C.gold : C.tan}>Parceiro comercial</GhostButton>
        </div>

        {canal === "parceiro" && (
          partners.length === 0 ? (
            <div style={{ fontSize: 13, color: C.warn, marginBottom: 10 }}>Cadastre um parceiro na aba "Parceiros" primeiro.</div>
          ) : (
            <div style={{ marginBottom: 10 }}>
              <Select value={partnerId} onChange={setPartnerId} width={"100%"}>
                {partners.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.tipo}</option>)}
              </Select>
            </div>
          )
        )}

        {canal === "direta" && (
          <div style={{ marginBottom: 10 }}>
            <input
              list="kemia-clientes" placeholder="Nome do cliente" aria-label="Nome do cliente" value={customer}
              onChange={(e) => setCustomer(e.target.value)} style={{ ...inputStyle, width: "100%" }}
            />
            <datalist id="kemia-clientes">{nomesConhecidos.map((n) => <option key={n} value={n} />)}</datalist>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Select value={productId} onChange={(v) => { setProductId(v); setUnitPrice(prices[v] ?? 0); setMsg(null); }} width={"1 1 180px"}>
            {products.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          <Select value={loteId} onChange={setLoteId} width={"1 1 160px"}>
            {lotesDisponiveis.length === 0 && <option value="">Sem lote disponível</option>}
            {lotesDisponiveis.map((l) => <option key={l.id} value={l.id}>{l.code} ({l.qtyRemaining} un)</option>)}
          </Select>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#8a8171" }}>Qtd</span><NumInput value={qty} onChange={(v) => setQty(num(v))} width={55} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#8a8171" }}>Preço/un</span><NumInput value={unitPrice} onChange={(v) => setUnitPrice(num(v))} width={70} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#8a8171" }}>Data</span>
            <input type="date" aria-label="Data da venda" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, fontSize: 13, color: "#6b6255" }}>
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
          {canal === "parceiro" ? "Já foi pago pelo parceiro" : "Pago agora (desmarque se for a prazo)"}
        </label>

        {msg && <div style={{ marginTop: 12, padding: "9px 12px", borderRadius: 8, fontSize: 13, background: msg.type === "ok" ? "#E4EEE4" : C.warnBg, color: msg.type === "ok" ? C.mid : C.warn }}>{msg.text}</div>}
        <div style={{ marginTop: 14 }}><SolidButton onClick={registrarVenda} bg={C.gold} full><Plus size={16} /> Registrar</SolidButton></div>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: C.deep }}>A receber · {brl(totalReceber)}</div>
          {grupos.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12.5, color: "#8a8171" }}>Data do recebimento</span>
              <input type="date" aria-label="Data do recebimento" value={payDate} onChange={(e) => setPayDate(e.target.value)} style={inputStyle} />
            </div>
          )}
        </div>
        {grupos.length === 0 ? <Empty>Nada pendente de recebimento.</Empty> : grupos.map((g) => (
          <div key={g.nome} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 10, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 600, color: C.ink }}>{g.nome} <span style={{ color: C.warn }}>· {brl(g.total)}</span></div>
              <GhostButton color={C.mid} onClick={() => darBaixa(g.itens.map((s) => s.id))}><Check size={13} /> Receber tudo ({g.itens.length})</GhostButton>
            </div>
            <div style={{ marginTop: 6 }}>
              {g.itens.map((s) => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, color: "#6b6255", borderTop: `1px solid ${C.line}`, padding: "5px 0", flexWrap: "wrap", alignItems: "center" }}>
                  <span>{fmtDate(s.date)} · {productById[s.productId]?.name || "produto removido"} · {s.qty} un · {brl(s.revenue)}</span>
                  <button onClick={() => darBaixa([s.id])} style={{ background: "none", border: "none", color: C.mid, fontSize: 12, fontWeight: 600 }}>Dar baixa</button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Card>

      <Card style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: C.deep, marginBottom: 10 }}>Histórico (mais recentes primeiro)</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
          <Select value={statusFilter} onChange={setStatusFilter} width={150}>
            <option value="todos">Todas</option>
            <option value="receber">A receber</option>
            <option value="pagos">Pagas</option>
          </Select>
          <input
            type="search" placeholder="Buscar cliente ou produto" aria-label="Buscar nas vendas" value={search}
            onChange={(e) => setSearch(e.target.value)} style={{ ...inputStyle, flex: "1 1 180px" }}
          />
        </div>
        {sales.length === 0 ? <Empty>Nenhuma venda registrada ainda.</Empty> : historico.length === 0 ? <Empty>Nenhuma venda encontrada com esse filtro.</Empty> : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Data</th><th>Cliente</th><th>Produto</th><th>Lote</th><th>Qtd</th><th>Valor</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {historico.map((s) => (
                  <tr key={s.id}>
                    <td>{fmtDate(s.date)}</td>
                    <td>{nomeDoComprador(s)}</td>
                    <td>{productById[s.productId]?.name || "removido"}</td>
                    <td><Pill tone={C.deep} bg={C.tan}>{lotes.find((l) => l.id === s.loteId)?.code || "—"}</Pill></td>
                    <td>{s.qty}</td>
                    <td>{brl(s.revenue)}</td>
                    <td>
                      {s.paid
                        ? <><Pill>Pago</Pill>{s.paidDate && s.paidDate !== s.date ? <div style={{ fontSize: 11, color: "#8a8171", marginTop: 2 }}>em {fmtDate(s.paidDate)}</div> : null}</>
                        : <Pill tone={C.warn} bg={C.warnBg}>A receber</Pill>}
                    </td>
                    <td>{!s.paid && <button onClick={() => darBaixa([s.id])} style={{ background: "none", border: "none", color: C.mid, fontSize: 12, fontWeight: 600 }}>Dar baixa</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 20, marginTop: 12, fontSize: 13.5, flexWrap: "wrap" }}>
          <span>Recebido: <b style={{ color: C.gold }}>{brl(totals.revenue)}</b></span>
          <span>A receber: <b style={{ color: C.warn }}>{brl(totals.pendente)}</b></span>
          <span>Lucro realizado: <b style={{ color: totals.profit >= 0 ? C.mid : C.warn }}>{brl(totals.profit)}</b></span>
        </div>
      </Card>
    </div>
  );
}
