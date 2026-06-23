import{a as t}from"./chunk-GXPICWIA.js";async function a(){let s=await t.get("/api/public-stats").catch(()=>({outings:0,users:0}));return`
    <section>
      <h1>Plan Team Outings Faster</h1>
      <p>Modern modular frontend with lazy-loaded routes.</p>
      <div class="stats">
        <div><strong>${s.outings||0}</strong><span>Outings</span></div>
        <div><strong>${s.users||0}</strong><span>Users</span></div>
      </div>
    </section>
  `}export{a as renderHome};
