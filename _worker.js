export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return api(request, env, url);
    }

    if (url.pathname === "/catalog.html") {
      return new Response(CATALOG_HTML, {
        headers: { "content-type": "text/html; charset=UTF-8" }
      });
    }

    return new Response(APP_HTML, {
      headers: { "content-type": "text/html; charset=UTF-8" }
    });
  }
};

async function api(request, env, url) {
  try {
    await initDB(env.DB);
    const path = url.pathname.slice(5);
    const method = request.method;

    if (path === "products" && method === "GET") {
      const r = await env.DB.prepare("SELECT * FROM products ORDER BY id DESC").all();
      return json(r.results);
    }

    if (path === "products" && method === "POST") {
      const d = await request.json();
      const r = await env.DB.prepare(
        "INSERT INTO products (name,code,price,photo) VALUES (?,?,?,?)"
      ).bind(d.name || "", d.code || "", Number(d.price || 0), d.photo || "").run();
      return json({ ok: true, id: r.meta.last_row_id });
    }

    if (path === "routes" && method === "GET") {
      const r = await env.DB.prepare(
        "SELECT * FROM routes ORDER BY date ASC,id DESC"
      ).all();
      return json(r.results);
    }

    if (path === "routes" && method === "POST") {
      const d = await request.json();
      const r = await env.DB.prepare(
        "INSERT INTO routes (name,city,date) VALUES (?,?,?)"
      ).bind(d.name || "", d.city || "", d.date || "").run();
      return json({ ok: true, id: r.meta.last_row_id });
    }

    if (path === "clients" && method === "GET") {
      const r = await env.DB.prepare(`
        SELECT c.*, r.name route_name, r.city route_city, r.date route_date
        FROM clients c LEFT JOIN routes r ON r.id=c.route_id
        ORDER BY c.id DESC
      `).all();
      return json(r.results);
    }

    if (path === "clients" && method === "POST") {
      const d = await request.json();
      const token = crypto.randomUUID().replaceAll("-", "");
      const r = await env.DB.prepare(
        "INSERT INTO clients (name,phone,city,route_id,token) VALUES (?,?,?,?,?)"
      ).bind(d.name || "", d.phone || "", d.city || "", d.route_id || null, token).run();
      return json({ ok: true, id: r.meta.last_row_id, token });
    }

    if (path === "sales" && method === "GET") {
      const r = await env.DB.prepare("SELECT * FROM sales ORDER BY id DESC").all();
      return json(r.results);
    }

    if (path === "sales" && method === "POST") {
      const d = await request.json();
      const r = await env.DB.prepare(`
        INSERT INTO sales
        (client_id,client_name,city,route_id,route_name,route_date,payment,items,total,status,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        d.client_id || null, d.client_name || "", d.city || "",
        d.route_id || null, d.route_name || "", d.route_date || "",
        d.payment || "", JSON.stringify(d.items || []), Number(d.total || 0),
        d.status || "Pendente", new Date().toISOString()
      ).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }

    if (path === "orders" && method === "GET") {
      const r = await env.DB.prepare("SELECT * FROM orders ORDER BY id DESC").all();
      return json(r.results);
    }

    if (path === "orders" && method === "POST") {
      const d = await request.json();
      const r = await env.DB.prepare(`
        INSERT INTO orders
        (client_id,client_name,city,route_id,route_name,items,total,created_at,status)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).bind(
        d.client_id || null, d.client_name || "", d.city || "",
        d.route_id || null, d.route_name || "", JSON.stringify(d.items || []),
        Number(d.total || 0), new Date().toISOString(), "Novo"
      ).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }

    if (path === "catalog-client" && method === "GET") {
      const token = url.searchParams.get("token");
      if (!token) return json({ error: "Token não informado" }, 400);
      const r = await env.DB.prepare(`
        SELECT c.*, r.name route_name, r.city route_city, r.date route_date
        FROM clients c LEFT JOIN routes r ON r.id=c.route_id
        WHERE c.token=? LIMIT 1
      `).bind(token).all();
      return json(r.results[0] || null);
    }

    if (path === "init" && method === "GET") return json({ ok: true });
    return json({ error: "Endpoint não encontrado" }, 404);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

async function initDB(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, city TEXT NOT NULL, date TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT, city TEXT,
      route_id INTEGER, token TEXT UNIQUE
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, code TEXT,
      price REAL DEFAULT 0, photo TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER, client_name TEXT, city TEXT,
      route_id INTEGER, route_name TEXT, route_date TEXT, payment TEXT, items TEXT,
      total REAL DEFAULT 0, status TEXT, created_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER, client_name TEXT, city TEXT,
      route_id INTEGER, route_name TEXT, items TEXT, total REAL DEFAULT 0,
      created_at TEXT, status TEXT
    )`)
  ]);
}

function json(data, status=200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=UTF-8" }
  });
}

const APP_HTML = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sistema de Vendas</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f4f5f7;color:#17202a}
header{background:#111827;color:#fff;padding:18px 16px;position:sticky;top:0;z-index:5}
header h1{margin:0;font-size:22px}.wrap{max-width:1000px;margin:auto;padding:16px}
nav{display:flex;gap:8px;overflow:auto;padding:10px 0;position:sticky;top:62px;background:#f4f5f7;z-index:4}
nav button{border:0;border-radius:12px;padding:11px 14px;background:#fff;white-space:nowrap;font-weight:700}
nav button.active{background:#111827;color:#fff}.tab{display:none}.tab.active{display:block}
.card{background:#fff;border-radius:16px;padding:16px;margin:12px 0;box-shadow:0 2px 10px #0000000d}
h2{margin:4px 0 14px}h3{margin:0 0 8px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
input,select,button{font:inherit}input,select{width:100%;padding:12px;border:1px solid #d1d5db;border-radius:10px;background:#fff}
label{font-weight:700;font-size:13px;display:block;margin:8px 0 5px}.btn{border:0;border-radius:10px;padding:12px 15px;background:#111827;color:#fff;font-weight:700}.btn2{background:#e5e7eb;color:#111827}
.row{display:flex;gap:8px;align-items:center;justify-content:space-between}.muted{color:#6b7280}.price{font-weight:800}.product{display:flex;gap:12px;align-items:center}.product img{width:64px;height:64px;border-radius:10px;object-fit:cover;background:#eee}.qty{width:70px}
table{width:100%;border-collapse:collapse}td,th{padding:9px 5px;border-bottom:1px solid #eee;text-align:left;font-size:14px}
.toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:12px 16px;border-radius:12px;display:none;z-index:20}
.big{font-size:28px;font-weight:900}.danger{color:#b91c1c}
</style>
</head>
<body>
<header><h1>📦 Meu Sistema de Vendas</h1></header>
<div class="wrap">
<nav id="nav">
<button data-tab="inicio" class="active">Início</button>
<button data-tab="produtos">Produtos</button>
<button data-tab="clientes">Clientes</button>
<button data-tab="rotas">Rotas</button>
<button data-tab="vendas">Vendas</button>
<button data-tab="pedidos">Pedidos recebidos</button>
</nav>

<section id="inicio" class="tab active">
<div class="grid">
<div class="card"><div class="muted">Produtos</div><div id="sProdutos" class="big">0</div></div>
<div class="card"><div class="muted">Clientes</div><div id="sClientes" class="big">0</div></div>
<div class="card"><div class="muted">Rotas</div><div id="sRotas" class="big">0</div></div>
<div class="card"><div class="muted">Pedidos novos</div><div id="sPedidos" class="big">0</div></div>
</div>
<div class="card"><h2>Como usar</h2><p>Cadastre primeiro suas rotas, clientes e produtos. Depois faça as vendas na aba <b>Vendas</b>.</p></div>
</section>

<section id="produtos" class="tab">
<div class="card"><h2>Novo produto</h2>
<div class="grid">
<div><label>Nome</label><input id="pNome" placeholder="Ex.: Jogo de cama"></div>
<div><label>Código</label><input id="pCodigo" placeholder="Ex.: 001"></div>
<div><label>Preço</label><input id="pPreco" type="number" step="0.01" placeholder="0,00"></div>
<div><label>Foto</label><input id="pFoto" type="file" accept="image/*"></div>
</div><br><button class="btn" onclick="addProduct()">Cadastrar produto</button></div>
<div class="card"><h2>Produtos cadastrados</h2><div id="listaProdutos"></div></div>
</section>

<section id="clientes" class="tab">
<div class="card"><h2>Novo cliente</h2>
<div class="grid">
<div><label>Nome</label><input id="cNome" placeholder="Nome do cliente"></div>
<div><label>Telefone</label><input id="cTelefone" placeholder="WhatsApp"></div>
<div><label>Rota</label><select id="cRota"></select></div>
</div><br><button class="btn" onclick="addClient()">Cadastrar cliente</button></div>
<div class="card"><h2>Clientes</h2><div id="listaClientes"></div></div>
</section>

<section id="rotas" class="tab">
<div class="card"><h2>Nova rota</h2>
<div class="grid">
<div><label>Nome da rota</label><input id="rNome" placeholder="Ex.: Curvelo"></div>
<div><label>Cidade</label><input id="rCidade" placeholder="Curvelo"></div>
<div><label>Data</label><input id="rData" type="date"></div>
</div><br><button class="btn" onclick="addRoute()">Cadastrar rota</button></div>
<div class="card"><h2>Rotas</h2><div id="listaRotas"></div></div>
</section>

<section id="vendas" class="tab">
<div class="card"><h2>Nova venda</h2>
<label>Cliente</label><select id="vCliente" onchange="clientChanged()"></select>
<div class="grid">
<div><label>Cidade</label><input id="vCidade" readonly></div>
<div><label>Rota</label><input id="vRota" readonly></div>
<div><label>Data da rota</label><input id="vData" readonly></div>
</div>
<label>Pagamento</label><select id="vPagamento"><option>60 dias</option><option>30 dias</option><option>À vista</option><option>Pix</option><option>Cartão</option></select>
<h3 style="margin-top:18px">Produtos</h3>
<div id="vProdutos"></div>
<div class="row" style="margin-top:15px"><b>TOTAL</b><span id="vTotal" class="big">R$ 0,00</span></div>
<br><button class="btn" onclick="finishSale()">Finalizar venda</button>
</div>
</section>

<section id="pedidos" class="tab">
<div class="card"><h2>Pedidos recebidos</h2><div id="listaPedidos"></div></div>
</section>
</div>
<div id="toast" class="toast"></div>

<script>
const $=id=>document.getElementById(id);
let products=[],clients=[],routes=[],orders=[],cart={};

function money(v){return Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}
async function get(path){const r=await fetch("/api/"+path);return r.json()}
async function post(path,data){const r=await fetch("/api/"+path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(data)});return r.json()}
function toast(t){$("toast").textContent=t;$("toast").style.display="block";setTimeout(()=>$("toast").style.display="none",2200)}

document.querySelectorAll("#nav button").forEach(b=>b.onclick=()=>{
 document.querySelectorAll("#nav button").forEach(x=>x.classList.remove("active"));b.classList.add("active");
 document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));$(b.dataset.tab).classList.add("active");
 if(b.dataset.tab==="vendas")renderSaleProducts();
});

async function load(){
 [products,clients,routes,orders]=await Promise.all([get("products"),get("clients"),get("routes"),get("orders")]);
 renderAll();
}
function renderAll(){renderProducts();renderClients();renderRoutes();renderSelects();renderOrders();updateStats()}
function updateStats(){$("sProdutos").textContent=products.length;$("sClientes").textContent=clients.length;$("sRotas").textContent=routes.length;$("sPedidos").textContent=orders.filter(x=>x.status==="Novo").length}

function renderProducts(){
 $("listaProdutos").innerHTML=products.length?products.map(p=>`<div class="card product"><img src="${p.photo||''}"><div style="flex:1"><b>${esc(p.name)}</b><div class="muted">Código: ${esc(p.code||"-")}</div><div class="price">${money(p.price)}</div></div></div>`).join(""):"<p class='muted'>Nenhum produto cadastrado.</p>";
}
function renderClients(){
 $("listaClientes").innerHTML=clients.length?clients.map(c=>`<div class="card"><div class="row"><div><b>${esc(c.name)}</b><div>${esc(c.phone||"")}</div><div class="muted">${esc(c.city||c.route_city||"")} · ${esc(c.route_name||"")}</div></div><button class="btn btn2" onclick="copyCatalog('${c.token}')">Copiar catálogo</button></div></div>`).join(""):"<p class='muted'>Nenhum cliente cadastrado.</p>";
}
function renderRoutes(){
 $("listaRotas").innerHTML=routes.length?routes.map(r=>`<div class="card"><b>${esc(r.name)}</b><div>${esc(r.city)} · ${r.date?new Date(r.date+"T12:00:00").toLocaleDateString("pt-BR"):""}</div></div>`).join(""):"<p class='muted'>Nenhuma rota cadastrada.</p>";
}
function renderSelects(){
 $("cRota").innerHTML="<option value=''>Selecione</option>"+routes.map(r=>`<option value="${r.id}">${esc(r.name)} — ${esc(r.city)}</option>`).join("");
 $("vCliente").innerHTML="<option value=''>Selecione o cliente</option>"+clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");
}
function clientChanged(){
 const c=clients.find(x=>x.id==$("vCliente").value);if(!c){$("vCidade").value="";$("vRota").value="";$("vData").value="";return}
 $("vCidade").value=c.city||c.route_city||"";$("vRota").value=c.route_name||"";
 $("vData").value=c.route_date?new Date(c.route_date+"T12:00:00").toLocaleDateString("pt-BR"):"";
}
function renderSaleProducts(){
 $("vProdutos").innerHTML=products.length?products.map(p=>`<div class="card product"><img src="${p.photo||''}"><div style="flex:1"><b>${esc(p.name)}</b><div class="price">${money(p.price)}</div></div><input class="qty" type="number" min="0" value="${cart[p.id]||0}" onchange="setQty(${p.id},this.value)"></div>`).join(""):"<p class='muted'>Cadastre produtos primeiro.</p>";
 updateTotal();
}
function setQty(id,q){q=Math.max(0,parseInt(q||0));if(q)cart[id]=q;else delete cart[id];updateTotal()}
function currentItems(){return Object.entries(cart).map(([id,q])=>{const p=products.find(x=>x.id==id);return p?{product_id:p.id,name:p.name,price:Number(p.price),qty:q,total:Number(p.price)*q}:null}).filter(Boolean)}
function updateTotal(){$("vTotal").textContent=money(currentItems().reduce((s,x)=>s+x.total,0))}
async function addProduct(){
 const name=$("pNome").value.trim(),price=Number($("pPreco").value||0);if(!name||price<=0)return toast("Preencha nome e preço");
 let photo="";const f=$("pFoto").files[0];if(f){photo=await new Promise(res=>{const rd=new FileReader();rd.onload=()=>res(rd.result);rd.readAsDataURL(f)})}
 await post("products",{name,code:$("pCodigo").value.trim(),price,photo});$("pNome").value="";$("pCodigo").value="";$("pPreco").value="";$("pFoto").value="";await load();toast("Produto cadastrado");
}
async function addRoute(){
 const name=$("rNome").value.trim(),city=$("rCidade").value.trim(),date=$("rData").value;if(!name||!city)return toast("Preencha nome e cidade");
 await post("routes",{name,city,date});$("rNome").value="";$("rCidade").value="";$("rData").value="";await load();toast("Rota cadastrada");
}
async function addClient(){
 const name=$("cNome").value.trim(),phone=$("cTelefone").value.trim(),rid=$("cRota").value;if(!name||!rid)return toast("Informe nome e rota");
 const r=routes.find(x=>x.id==rid);await post("clients",{name,phone,city:r.city,route_id:Number(rid)});$("cNome").value="";$("cTelefone").value="";await load();toast("Cliente cadastrado");
}
async function finishSale(){
 const c=clients.find(x=>x.id==$("vCliente").value),items=currentItems();if(!c)return toast("Selecione o cliente");if(!items.length)return toast("Escolha produtos");
 const r=routes.find(x=>x.id==c.route_id),total=items.reduce((s,x)=>s+x.total,0);
 await post("sales",{client_id:c.id,client_name:c.name,city:c.city||r?.city||"",route_id:c.route_id,route_name:r?.name||"",route_date:r?.date||"",payment:$("vPagamento").value,items,total,status:"Pendente"});
 let msg="VENDA REALIZADA\\nCliente: "+c.name+"\\nCidade: "+(c.city||r?.city||"")+"\\nRota: "+(r?.name||"")+"\\n";
 msg+=items.map(x=>x.qty+"x "+x.name+" — "+money(x.total)).join("\\n")+"\\nTOTAL: "+money(total)+"\\nPagamento: "+$("vPagamento").value;
 if(c.phone){window.open("https://wa.me/"+c.phone.replace(/\\D/g,"")+"?text="+encodeURIComponent(msg),"_blank")}
 cart={};renderSaleProducts();toast("Venda registrada");
}
function renderOrders(){
 $("listaPedidos").innerHTML=orders.length?orders.map(o=>{let items=[];try{items=JSON.parse(o.items||"[]")}catch(e){}return `<div class="card"><b>${esc(o.client_name)}</b><div>${esc(o.city||"")} · ${esc(o.route_name||"")}</div><div class="muted">${new Date(o.created_at).toLocaleString("pt-BR")}</div><ul>${items.map(x=>`<li>${x.qty}x ${esc(x.name)} — ${money(x.total)}</li>`).join("")}</ul><b>${money(o.total)}</b></div>`}).join(""):"<p class='muted'>Nenhum pedido recebido.</p>";
}
function copyCatalog(token){const u=location.origin+"/catalog.html?token="+token;navigator.clipboard?.writeText(u);prompt("Link do catálogo:",u)}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
load();
</script>
</body></html>`;

const CATALOG_HTML = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Catálogo</title><style>
body{margin:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#17202a}
header{background:#111827;color:#fff;padding:20px}.wrap{max-width:700px;margin:auto;padding:14px}.card{background:#fff;border-radius:15px;padding:14px;margin:10px 0}
.product{display:flex;gap:12px;align-items:center}.product img{width:72px;height:72px;object-fit:cover;border-radius:10px;background:#eee}.product div{flex:1}
input{width:70px;padding:10px;border:1px solid #ddd;border-radius:9px}.btn{width:100%;padding:14px;border:0;border-radius:12px;background:#111827;color:#fff;font-weight:800}
.price{font-weight:800}.total{font-size:24px;font-weight:900}
</style></head><body><header><h2>🛍️ Catálogo</h2><div id="cliente"></div></header><div class="wrap">
<div id="lista"></div><div class="card"><label>Seu nome</label><input id="nome" style="width:100%;box-sizing:border-box"><br><br><button class="btn" onclick="send()">Enviar pedido</button><p class="total" id="total">R$ 0,00</p></div></div>
<script>
let token=new URLSearchParams(location.search).get("token"),client=null,products=[],cart={};
const $=id=>document.getElementById(id);
const money=v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
async function load(){
 client=await (await fetch("/api/catalog-client?token="+encodeURIComponent(token))).json();
 if(!client||client.error){$("cliente").textContent="Catálogo não encontrado";return}
 $("cliente").textContent="Olá, "+client.name;
 products=await (await fetch("/api/products")).json();render();
}
function render(){
 $("lista").innerHTML=products.map(p=>`<div class="card product"><img src="${p.photo||''}"><div><b>${p.name}</b><div class="price">${money(p.price)}</div></div><input type="number" min="0" value="${cart[p.id]||0}" onchange="qty(${p.id},this.value)"></div>`).join("");
 total();
}
function qty(id,v){v=Math.max(0,parseInt(v||0));if(v)cart[id]=v;else delete cart[id];total()}
function total(){let t=Object.entries(cart).reduce((s,[id,q])=>{let p=products.find(x=>x.id==id);return s+(p?Number(p.price)*q:0)},0);$("total").textContent=money(t)}
async function send(){
 let items=Object.entries(cart).map(([id,q])=>{let p=products.find(x=>x.id==id);return p?{product_id:p.id,name:p.name,price:Number(p.price),qty:q,total:Number(p.price)*q}:null}).filter(Boolean);
 if(!items.length)return alert("Escolha pelo menos um produto.");
 let total=items.reduce((s,x)=>s+x.total,0);
 let name=$("nome").value.trim()||client.name;
 await fetch("/api/orders",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({client_id:client.id,client_name:name,city:client.city||client.route_city||"",route_id:client.route_id,route_name:client.route_name||"",items,total})});
 alert("Pedido enviado com sucesso!");cart={};render();
}
load();
</script></body></html>`;
