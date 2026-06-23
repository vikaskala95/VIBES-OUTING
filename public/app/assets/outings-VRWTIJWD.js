import{a as i}from"./chunk-GXPICWIA.js";async function n(){return`<section><h1>Outings</h1><div class="grid">${(await i.get("/api/outings").catch(()=>[])).slice(0,20).map(t=>`
    <article class="card">
      <h3>${t.title}</h3>
      <p>${t.location}</p>
      <p>INR ${t.cost}</p>
    </article>
  `).join("")}</div></section>`}export{n as renderOutings};
