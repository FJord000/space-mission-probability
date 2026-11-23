/* =====================================================================
   3D SAHNE MOTORU (Three.js r147)
   Gezegen dokuları: NASA (kamu malı) — NASA 3D Resources & NASA SVS (LRO).
   Dışarıya açılan API:
     W3.attach(hostEl)          → 3D görüntüyü bu kutuya yerleştirir
     W3.set(kind)               → sahne: 'intro', 'pad-wind', 'space-meteor', 'orbit-aero', 'land-site', 'end-win', ...
     W3.play('success'|'fail')  → sonuç animasyonu
     W3.warp(kicker, title, cb) → aşama geçişi (ışık hızı)
     W3.shield / W3.bags / W3.tension / W3.sparkle()
   ===================================================================== */
const W3 = (function(){
  const T = window.THREE;
  const noop = { ok:false, attach(){}, set(){}, play(){}, sparkle(){}, resize(){}, warp(k,t,cb){ if(cb) setTimeout(cb, 30); } };
  if(!T) return noop;
  let R;
  try{
    if(T.ColorManagement) T.ColorManagement.legacyMode = false;
    R = new T.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
  }catch(e){ console.warn('WebGL yok', e); return noop; }

  const E = { ok:true, kind:'', state:'idle', st:0, t:0, shake:0, tension:0, shield:false, bags:false, flash:0, ev:{} };
  const TAU = Math.PI*2, rnd = (a,b) => a + Math.random()*(b-a), pick = a => a[Math.floor(Math.random()*a.length)];
  const clamp = (x,a,b) => Math.max(a, Math.min(b, x)), ease = u => u<.5 ? 2*u*u : 1-Math.pow(-2*u+2,2)/2;
  const V = (x,y,z) => new T.Vector3(x,y,z), C = c => new T.Color(c);
  /* toplamalı karışım: rengi ekler, alfa kanalına dokunmaz (bloom ile koyu leke oluşmasını önler) */
  const ADD = { blending:T.CustomBlending, blendEquation:T.AddEquation, blendSrc:T.SrcAlphaFactor, blendDst:T.OneFactor, blendSrcAlpha:T.ZeroFactor, blendDstAlpha:T.OneFactor };

  R.outputEncoding = T.sRGBEncoding;
  R.toneMapping = T.NoToneMapping;   // ACES, parçacıklar ve bloom ile koyu leke yapıyordu
  R.setPixelRatio(Math.min(1.5, window.devicePixelRatio||1));
  R.domElement.style.cssText = 'display:block;width:100%;height:100%';
  const scn = new T.Scene(), cam = new T.PerspectiveCamera(40, 2, .1, 3000);
  const composer = new T.EffectComposer(R);
  composer.addPass(new T.RenderPass(scn, cam));
  const bloom = new T.UnrealBloomPass(new T.Vector2(512,256), .85, .12, 1.0); composer.addPass(bloom);
  bloom.compositeMaterial.uniforms.bloomFactors.value = [1.0, .7, .4, .12, 0.0];   // kaba katmanlar köşeli hale yapıyordu
  composer.addPass(new T.ShaderPass(T.GammaCorrectionShader));
  const root = new T.Group(); scn.add(root);
  const tmp = new T.Group(); scn.add(tmp);

  /* ---------- yardımcılar ---------- */
  function hash(x,y){ const h = Math.sin(x*127.1 + y*311.7)*43758.5453; return h - Math.floor(h); }
  function vnoise(x,y){ const xi=Math.floor(x), yi=Math.floor(y), xf=x-xi, yf=y-yi, u=xf*xf*(3-2*xf), v=yf*yf*(3-2*yf);
    const a=hash(xi,yi), b=hash(xi+1,yi), c=hash(xi,yi+1), d=hash(xi+1,yi+1); return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v; }
  function fbm(x,y,o=5){ let s=0,a=.5,f=1; for(let i=0;i<o;i++){ s+=a*vnoise(x*f,y*f); f*=2.03; a*=.5; } return s; }
  function ctex(w, h, draw, opt={}){
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); if(opt.srgb !== false) t.encoding = T.sRGBEncoding;
    if(opt.repeat){ t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(opt.repeat, opt.repeat); }
    t.anisotropy = R.capabilities.getMaxAnisotropy(); return t;
  }
  const TX = {};
  const loader = new T.TextureLoader();
  for(const k in (window.TEX||{})){ const t = loader.load(window.TEX[k]); t.encoding = T.sRGBEncoding; t.anisotropy = R.capabilities.getMaxAnisotropy(); TX[k] = t; }
  const SOFT = ctex(64,64,(g,w)=>{ const gr = g.createRadialGradient(32,32,0,32,32,32); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(.25,'rgba(255,255,255,.8)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0,0,64,64); }, {srgb:false});
  const CLOUD = ctex(256,128,(g,w,h)=>{ for(let i=0;i<46;i++){ const x = rnd(.15,.85)*w, y = rnd(.35,.7)*h, r = rnd(14,40)*(1-Math.abs(x/w-.5));
      const gr = g.createRadialGradient(x,y,0,x,y,r); gr.addColorStop(0,'rgba(255,255,255,.42)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x,y,r,0,TAU); g.fill(); } });

  /* ---------- shader malzemeleri ---------- */
  function skyMat(){
    return new T.ShaderMaterial({ side:T.BackSide, depthWrite:false, fog:false,
      uniforms:{ top:{value:C('#000')}, mid:{value:C('#000')}, bot:{value:C('#000')}, sunDir:{value:V(0,1,0)}, sunCol:{value:C('#fff')}, sunSize:{value:400}, halo:{value:C('#000')} },
      vertexShader:`varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position = p.xyww; }`,
      fragmentShader:`uniform vec3 top,mid,bot,sunCol,halo; uniform vec3 sunDir; uniform float sunSize; varying vec3 vD;
        void main(){ vec3 d = normalize(vD); float h = d.y;
          vec3 c = h > 0. ? mix(mid, top, pow(clamp(h,0.,1.), .55)) : mix(mid, bot, clamp(-h*5.,0.,1.));
          float s = max(dot(d, normalize(sunDir)), 0.);
          c += sunCol*pow(s, sunSize)*3.5 + halo*(pow(s,12.)*.55 + pow(s,3.)*.12);
          gl_FragColor = vec4(c,1.); }` });
  }
  function setSky(m, o){ m.uniforms.top.value.set(o.top); m.uniforms.mid.value.set(o.mid); m.uniforms.bot.value.set(o.bot);
    m.uniforms.sunDir.value.copy(o.sun).normalize(); m.uniforms.sunCol.value.set(o.sunCol||'#fff'); m.uniforms.sunSize.value = o.sunSize||600; m.uniforms.halo.value.set(o.halo||'#000'); }
  function fresnelMat(color, power=3, strength=1.4){
    return new T.ShaderMaterial({ transparent:true, depthWrite:false, ...ADD,
      uniforms:{ c:{value:C(color)}, p:{value:power}, s:{value:strength}, t:{value:0}, band:{value:0} },
      vertexShader:`varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix*mv; }`,
      fragmentShader:`uniform vec3 c; uniform float p,s,t,band; varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main(){ float f = pow(1. - max(dot(vN,vV),0.), p); float b = band*(.5+.5*sin(vP.y*18. - t*5.))*.25;
          float a = f*s + b; gl_FragColor = vec4(c*a, a); }` });
  }
  function flameMat(c1, c2){
    return new T.ShaderMaterial({ transparent:true, depthWrite:false, ...ADD, side:T.DoubleSide,
      uniforms:{ t:{value:0}, k:{value:0}, c1:{value:C(c1)}, c2:{value:C(c2)} },
      vertexShader:`varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader:`uniform float t,k; uniform vec3 c1,c2; varying vec2 vU;
        void main(){ float y = 1. - vU.y; float n = .75 + .25*sin(y*28. - t*55. + sin(vU.x*30.)*2.);
          float a = pow(1. - y, .7)*smoothstep(0., .12, y + .02)*n*k; vec3 col = mix(c2, c1, pow(1. - y, 2.5)); gl_FragColor = vec4(col*a*2.5, a); }` });
  }

  /* ---------- parçacık sistemi ---------- */
  class PSys{
    constructor(max, additive){
      this.max = max; this.p = [];
      this.pos = new Float32Array(max*3); this.col = new Float32Array(max*3); this.siz = new Float32Array(max); this.alp = new Float32Array(max);
      const g = this.geo = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(this.pos,3).setUsage(T.DynamicDrawUsage));
      g.setAttribute('color', new T.BufferAttribute(this.col,3).setUsage(T.DynamicDrawUsage));
      g.setAttribute('size', new T.BufferAttribute(this.siz,1).setUsage(T.DynamicDrawUsage));
      g.setAttribute('alpha', new T.BufferAttribute(this.alp,1).setUsage(T.DynamicDrawUsage));
      this.mat = new T.ShaderMaterial({ transparent:true, depthWrite:false, ...(additive ? ADD : {blending:T.NormalBlending}),
        uniforms:{ map:{value:SOFT}, scale:{value:500} },
        vertexShader:`attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float scale;
          void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = size*scale/max(.1,-mv.z); gl_Position = projectionMatrix*mv; }`,
        fragmentShader:`uniform sampler2D map; varying vec3 vC; varying float vA; void main(){ float m = texture2D(map, gl_PointCoord).a; gl_FragColor = vec4(vC, vA*m); }` });
      this.pts = new T.Points(g, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = additive ? 3 : 2;
    }
    spawn(o){ if(this.p.length >= this.max) this.p.shift();
      o.max = o.life; o.c0 = C(o.c0||'#fff'); if(o.c1) o.c1 = C(o.c1); if(o.a == null) o.a = 1; this.p.push(o); }
    update(dt){
      const tc = new T.Color(); let n = 0;
      for(const o of this.p){
        o.life -= dt; o.vy += (o.g||0)*dt;
        if(o.drag){ const f = Math.max(0, 1-o.drag*dt); o.vx *= f; o.vy *= f; o.vz *= f; }
        o.x += o.vx*dt; o.y += o.vy*dt; o.z += o.vz*dt; if(o.grow) o.s += o.grow*dt;
      }
      this.p = this.p.filter(o => o.life > 0);
      for(const o of this.p){
        const age = 1 - o.life/o.max;
        this.pos[n*3] = o.x; this.pos[n*3+1] = o.y; this.pos[n*3+2] = o.z;
        if(o.c1) tc.copy(o.c0).lerp(o.c1, age); else tc.copy(o.c0);
        this.col[n*3] = tc.r; this.col[n*3+1] = tc.g; this.col[n*3+2] = tc.b;
        this.siz[n] = o.s; this.alp[n] = o.a*(1-age)*(o.fadeIn ? Math.min(1, age*o.max*5) : 1);
        n++;
      }
      this.geo.setDrawRange(0, n);
      for(const k of ['position','color','size','alpha']) this.geo.attributes[k].needsUpdate = true;
    }
    clear(){ this.p.length = 0; this.geo.setDrawRange(0,0); }
  }
  const FX = new PSys(2600, true), SMK = new PSys(900, false);
  scn.add(FX.pts); scn.add(SMK.pts);

  /* ---------- ışıklar ---------- */
  const hemi = new T.HemisphereLight('#ffffff', '#222222', .4); scn.add(hemi);
  const sun = new T.DirectionalLight('#ffffff', 2.5); sun.position.set(-10, 6, 8); scn.add(sun); scn.add(sun.target);
  const boomLight = new T.PointLight('#ffaa55', 0, 60, 2); scn.add(boomLight);
  const floods = [0,1].map(() => new T.SpotLight('#eaf0ff', 0, 40, .45, .6, 1.2));

  /* ---------- ortam haritaları (metal yansımaları için) ---------- */
  const pmrem = new T.PMREMGenerator(R);
  const envCache = {};
  function env(key, o){
    if(envCache[key]) return envCache[key];
    const s = new T.Scene(), m = skyMat(); setSky(m, o); s.add(new T.Mesh(new T.SphereGeometry(10, 32, 16), m));
    return envCache[key] = pmrem.fromScene(s, .04).texture;
  }
  const SPACE_ENV = { top:'#0a1028', mid:'#141a30', bot:'#05060c', sun:V(-1,.5,.6), sunCol:'#fff3dc', sunSize:20, halo:'#6a6a70' };

  /* =====================================================================
     NESNELER (bir kez kurulur, tekrar kullanılır)
     ===================================================================== */
  const O = {};
  const SPH = new T.SphereGeometry(1, 128, 64);

  /* --- uzay arka planı: NASA Hipparcos yıldız haritası + parlak yıldızlar --- */
  (function(){
    const g = new T.Group();
    const skyM = new T.MeshBasicMaterial({ map: TX.stars || null, color: TX.stars ? C('#ffffff').multiplyScalar(2.6) : C('#000'), side:T.BackSide, depthWrite:false, fog:false });
    const sky = new T.Mesh(new T.SphereGeometry(1500, 64, 32), skyM); sky.rotation.set(.6, 2.2, .3); g.add(sky);
    const N = 1800, pos = new Float32Array(N*3), col = new Float32Array(N*3), siz = new Float32Array(N), alp = new Float32Array(N);
    const tints = ['#ffffff','#cfe0ff','#ffe9c4','#aac8ff','#fff4e0'];
    for(let i=0;i<N;i++){ const v = V(rnd(-1,1), rnd(-1,1), rnd(-1,1)).normalize().multiplyScalar(1200);
      pos.set([v.x,v.y,v.z], i*3); const c = C(pick(tints)); col.set([c.r,c.g,c.b], i*3); siz[i] = Math.pow(Math.random(), 6)*9 + 1.6; alp[i] = rnd(.45, 1); }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos,3)); geo.setAttribute('color', new T.BufferAttribute(col,3));
    geo.setAttribute('size', new T.BufferAttribute(siz,1)); geo.setAttribute('alpha', new T.BufferAttribute(alp,1));
    const m = new T.ShaderMaterial({ transparent:true, depthWrite:false, ...ADD, fog:false, uniforms:{ map:{value:SOFT}, t:{value:0} },
      vertexShader:`attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float t;
        void main(){ vC = color; vA = alpha*(.75+.25*sin(t*2.+position.x*.05+position.y*.07)); vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = size; gl_Position = projectionMatrix*mv; }`,
      fragmentShader:`uniform sampler2D map; varying vec3 vC; varying float vA; void main(){ gl_FragColor = vec4(vC*1.6, vA*texture2D(map, gl_PointCoord).a); }` });
    O.starMat = m; g.add(new T.Points(geo, m));
    O.space = g;
  })();

  /* --- uzay tozu / hız çizgileri --- */
  (function(){
    const N = 260, pos = new Float32Array(N*6), seg = [];
    for(let i=0;i<N;i++) seg.push({x:rnd(-30,30), y:rnd(-10,10), z:rnd(-30,6)});
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos,3).setUsage(T.DynamicDrawUsage));
    const m = new T.LineBasicMaterial({ color:C('#bcd2ff'), transparent:true, opacity:.55, ...ADD, depthWrite:false });
    O.dust = new T.LineSegments(geo, m); O.dust.frustumCulled = false; O.dust.userData = {seg, pos, geo};
  })();
  function updDust(dt, speed, dir=V(1,0,0)){
    const d = O.dust.userData, L = Math.max(.08, speed*.045);
    O.dust.material.opacity = clamp(.25 + speed*.02, .25, .9);
    d.seg.forEach((s,i) => {
      s.x -= speed*dt*dir.x; s.y -= speed*dt*dir.y; s.z -= speed*dt*dir.z;
      if(s.x < -32) s.x += 64; if(s.x > 32) s.x -= 64; if(s.z > 8) s.z -= 40; if(s.z < -34) s.z += 40;
      d.pos.set([s.x, s.y, s.z, s.x + L*dir.x, s.y + L*dir.y, s.z + L*dir.z], i*6);
    });
    d.geo.attributes.position.needsUpdate = true;
  }

  /* --- gezegenler (NASA dokuları) --- */
  function planet(texKey, fallback, atmo, rough=1){
    const g = new T.Group();
    const m = new T.MeshStandardMaterial({ map: TX[texKey] || null, color: TX[texKey] ? C('#fff') : C(fallback), roughness:rough, metalness:0 });
    const mesh = new T.Mesh(SPH, m); g.add(mesh); g.userData.mesh = mesh;
    if(atmo){ const a = new T.Mesh(SPH, fresnelMat(atmo.c, atmo.p, atmo.s)); a.scale.setScalar(atmo.r); g.add(a); }
    return g;
  }
  O.earth = planet('earth', '#2a6fd0', {c:'#5fa8ff', p:2.6, s:1.6, r:1.035}, .85);
  O.mars = planet('mars', '#c1582f', {c:'#ff9a6a', p:3.2, s:.9, r:1.02});
  O.moon = planet('moon', '#9a9a9a', null);
  /* toz fırtınası katmanı */
  O.dustLayer = new T.Mesh(SPH, new T.MeshStandardMaterial({ transparent:true, depthWrite:false, roughness:1, color:C('#e3a46c'),
    alphaMap: ctex(512,256,(g,w,h)=>{ const id = g.createImageData(w,h); for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const lat = Math.abs(y/h-.5)*2;
      const v = clamp((fbm(x/w*8, y/h*5, 5) - .42)*3.2, 0, 1) * (1-Math.pow(lat,3)); const i = (y*w+x)*4; id.data[i]=id.data[i+1]=id.data[i+2]=v*255; id.data[i+3]=255; } g.putImageData(id,0,0); }, {srgb:false}) }));
  O.dustLayer.scale.setScalar(1.008);
  /* Phobos: patates şekli, NASA dokusu */
  (function(){
    const geo = new T.IcosahedronGeometry(1, 5), p = geo.attributes.position;
    for(let i=0;i<p.count;i++){ const v = V(p.getX(i), p.getY(i), p.getZ(i)); const k = 1 + (fbm(v.x*1.8+v.z, v.y*1.8-v.z, 4)-.5)*.45; v.multiplyScalar(k); v.x *= 1.35; v.z *= .9; p.setXYZ(i, v.x, v.y, v.z); }
    geo.computeVertexNormals();
    O.phobos = new T.Mesh(geo, new T.MeshStandardMaterial({ map: TX.phobos || null, color: TX.phobos ? C('#fff') : C('#7d6d62'), roughness:1 }));
  })();
  /* Güneş */
  (function(){
    const g = new T.Group();
    g.add(new T.Mesh(SPH, new T.MeshBasicMaterial({ color:C('#fff6e0').multiplyScalar(4) })));
    for(const [s,c,o] of [[3.2,'#ffd27a',.9],[7,'#ff9a3d',.45],[16,'#ff7a2a',.22]]){
      const sp = new T.Sprite(new T.SpriteMaterial({ map:SOFT, color:C(c), transparent:true, opacity:o, ...ADD, depthWrite:false })); sp.scale.setScalar(s); g.add(sp); }
    O.sun = g;
  })();

  /* --- asteroitler (göktaşı bulutu) --- */
  (function(){
    const geo = new T.IcosahedronGeometry(1, 3), p = geo.attributes.position;
    for(let i=0;i<p.count;i++){ const v = V(p.getX(i), p.getY(i), p.getZ(i)); const k = 1 + (fbm(v.x*2.2+3, v.y*2.2+v.z*1.3, 4)-.5)*.75; v.multiplyScalar(k); p.setXYZ(i, v.x, v.y, v.z*.8); }
    geo.computeVertexNormals();
    const tex = ctex(256,256,(g,w,h)=>{ const id = g.createImageData(w,h); for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const n = fbm(x/32, y/32, 5), i = (y*w+x)*4; const v = 70 + n*110; id.data[i]=v*1.05; id.data[i+1]=v*.95; id.data[i+2]=v*.88; id.data[i+3]=255; } g.putImageData(id,0,0); });
    const N = 46, im = new T.InstancedMesh(geo, new T.MeshStandardMaterial({ map:tex, roughness:1, metalness:0 }), N);
    im.userData.rocks = Array.from({length:N}, () => newRock(true)); im.frustumCulled = false;
    O.rocks = im;
  })();
  function newRock(anywhere){ return { x: anywhere ? rnd(-26,30) : rnd(28,40), y: rnd(-7,7), z: rnd(-22,4), s: Math.pow(Math.random(),2.2)*1.4 + .12,
    vx: -rnd(1.5,4), vy: rnd(-.2,.2), rx: rnd(0,TAU), ry: rnd(0,TAU), vr: rnd(-1,1) }; }

  /* --- roket --- */
  (function(){
    const g = new T.Group();
    const prof = [[0,-2.05],[.36,-2.02],[.43,-1.85],[.46,-1.4],[.46,1.0],[.43,1.45],[.36,1.85],[.24,2.2],[.1,2.45],[0,2.52]].map(([r,y]) => new T.Vector2(r,y));
    const bodyTex = ctex(512,1024,(c,w,h)=>{
      c.fillStyle = '#dfe3ea'; c.fillRect(0,0,w,h);
      for(let i=0;i<9000;i++){ c.fillStyle = `rgba(0,0,0,${Math.random()*.03})`; c.fillRect(Math.random()*w, Math.random()*h, 2, 2); }
      c.fillStyle = '#c8322a'; c.fillRect(0,0,w,h*.13);
      c.fillStyle = '#1f2a44'; c.fillRect(0,h*.13,w,h*.015);
      c.fillStyle = '#2f5fd0'; c.fillRect(0,h*.62,w,h*.05);
      c.fillStyle = '#1a1d24'; for(let i=0;i<4;i++) c.fillRect(i*w/4, h*.8, w/8, h*.12);
      c.strokeStyle = 'rgba(40,50,70,.25)'; c.lineWidth = 2; for(const y of [.3,.45,.62,.67,.8]){ c.beginPath(); c.moveTo(0,y*h); c.lineTo(w,y*h); c.stroke(); }
      for(let i=0;i<8;i++){ c.beginPath(); c.moveTo(i*w/8,h*.15); c.lineTo(i*w/8,h*.8); c.stroke(); }
      c.save(); c.translate(w*.62, h*.48); c.rotate(-Math.PI/2); c.fillStyle = '#1f2a44'; c.font = 'bold 44px system-ui,sans-serif'; c.textAlign = 'center'; c.fillText('OLASILIK-1', 0, 0); c.restore();
      c.save(); c.translate(w*.12, h*.48); c.fillStyle = '#e30a17'; c.fillRect(-30,-20,60,40); c.fillStyle = '#fff'; c.beginPath(); c.arc(-6,0,11,0,TAU); c.fill(); c.fillStyle = '#e30a17'; c.beginPath(); c.arc(-3,0,9,0,TAU); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(9,0,4,0,TAU); c.fill(); c.restore();
    });
    bodyTex.flipY = true;
    const body = new T.Mesh(new T.LatheGeometry(prof, 64), new T.MeshStandardMaterial({ map:bodyTex, metalness:.35, roughness:.38 }));
    g.add(body);
    const bell = new T.Mesh(new T.LatheGeometry([[.18,-2.02],[.24,-2.2],[.34,-2.45],[.42,-2.6]].map(([r,y]) => new T.Vector2(r,y)), 40),
      new T.MeshStandardMaterial({ color:C('#3a3d46'), metalness:.95, roughness:.3, side:T.DoubleSide }));
    g.add(bell);
    const finShape = new T.Shape(); finShape.moveTo(0,0); finShape.lineTo(.75,-.55); finShape.lineTo(.75,-1.05); finShape.lineTo(0,-.55); finShape.closePath();
    const finGeo = new T.ExtrudeGeometry(finShape, { depth:.06, bevelEnabled:true, bevelThickness:.015, bevelSize:.015, bevelSegments:2 });
    finGeo.translate(.4, -.85, -.03);
    const finMat = new T.MeshStandardMaterial({ color:C('#c8322a'), metalness:.4, roughness:.35 });
    for(let i=0;i<4;i++){ const f = new T.Mesh(finGeo, finMat); f.rotation.y = i*Math.PI/2 + Math.PI/4; g.add(f); }
    const win = new T.Mesh(new T.SphereGeometry(.16, 24, 16), new T.MeshStandardMaterial({ color:C('#6fd8ff'), emissive:C('#2ba8ff'), emissiveIntensity:.8, metalness:.2, roughness:.05 }));
    win.position.set(0, 1.25, .43); win.scale.z = .45; g.add(win);
    const fOuter = new T.Mesh(new T.ConeGeometry(.42, 3.2, 32, 1, true), flameMat('#fff3c2', '#ff4a1a')); fOuter.rotation.x = Math.PI; fOuter.position.y = -2.6 - 1.6;
    const fInner = new T.Mesh(new T.ConeGeometry(.24, 1.6, 24, 1, true), flameMat('#ffffff', '#7fb8ff')); fInner.rotation.x = Math.PI; fInner.position.y = -2.6 - .8;
    g.add(fOuter); g.add(fInner);
    const eLight = new T.PointLight('#ff9a4d', 0, 14, 2); eLight.position.y = -3.2; g.add(eLight);
    const warn = new T.Mesh(new T.SphereGeometry(.07, 12, 8), new T.MeshBasicMaterial({ color:C('#ff2a2a').multiplyScalar(5) })); warn.position.set(.3, -1.2, .35); warn.visible = false; g.add(warn);
    const warnL = new T.PointLight('#ff2a2a', 0, 6, 2); warnL.position.copy(warn.position); g.add(warnL);
    const shield = new T.Mesh(SPH, fresnelMat('#5ec8ff', 3.2, .95)); shield.material.uniforms.band.value = .45; shield.scale.set(1.9, 3.4, 1.9); shield.visible = false; g.add(shield);
    const plasma = new T.Mesh(SPH, fresnelMat('#ff7a2a', 1.4, 2.2)); plasma.scale.set(1.2, 1.6, 1.2); plasma.position.y = 2.2; plasma.visible = false; g.add(plasma);
    g.userData = { fOuter, fInner, eLight, warn, warnL, shield, plasma, k:0 };
    O.rocket = g;
  })();
  function throttle(k){ const u = O.rocket.userData; u.k = k;
    const f = k*(0.88 + Math.random()*.24);
    u.fOuter.material.uniforms.k.value = f; u.fInner.material.uniforms.k.value = f;
    u.fOuter.scale.set(1, .4 + k*.75, 1); u.fOuter.position.y = -2.6 - 1.6*(.4 + k*.75);
    u.fInner.scale.set(1, .4 + k*.75, 1); u.fInner.position.y = -2.6 - .8*(.4 + k*.75);
    u.fOuter.material.uniforms.t.value = u.fInner.material.uniforms.t.value = E.t;
    u.eLight.intensity = k*4*(0.8 + Math.random()*.4);
  }
  const _v = new T.Vector3();
  function nozzleWorld(off=-2.65){ return O.rocket.localToWorld(_v.set(0, off, 0)).clone(); }
  function rocketAxis(){ return V(0,1,0).applyQuaternion(O.rocket.getWorldQuaternion(new T.Quaternion())).normalize(); }
  function exhaust(rate, speed=7, size=.35){
    rateDo('exh', rate, () => {
      const p = nozzleWorld(), ax = rocketAxis();
      FX.spawn({ x:p.x+rnd(-.1,.1), y:p.y+rnd(-.1,.1), z:p.z+rnd(-.1,.1), vx:-ax.x*speed*rnd(.7,1.3)+rnd(-.5,.5), vy:-ax.y*speed*rnd(.7,1.3)+rnd(-.5,.5), vz:-ax.z*speed*rnd(.7,1.3)+rnd(-.5,.5),
        life:rnd(.25,.6), s:size*rnd(.6,1.3), grow:size*1.5, c0:pick(['#ffe2a0','#ffc070','#fff2d0']), c1:'#ff3a10', drag:1.5 });
    });
  }

  /* --- iniş aracı --- */
  (function(){
    const g = new T.Group();
    const foilTex = ctex(256,256,(c,w,h)=>{ c.fillStyle = '#d6a640'; c.fillRect(0,0,w,h);
      for(let i=0;i<260;i++){ c.fillStyle = `rgba(${pick(['255,240,190','120,80,20','255,215,120'])},${rnd(.08,.3)})`; c.beginPath(); c.moveTo(rnd(0,w),rnd(0,h)); for(let k=0;k<4;k++) c.lineTo(rnd(0,w),rnd(0,h)); c.fill(); } });
    const foil = new T.MeshStandardMaterial({ map:foilTex, metalness:1, roughness:.32 });
    const white = new T.MeshStandardMaterial({ color:C('#e8ebf2'), metalness:.25, roughness:.45 });
    const dark = new T.MeshStandardMaterial({ color:C('#2b2f38'), metalness:.7, roughness:.4 });
    const body = new T.Mesh(new T.CylinderGeometry(1.05, 1.15, .95, 8), foil); body.position.y = 1.45; g.add(body);
    const deck = new T.Mesh(new T.CylinderGeometry(.95, 1.05, .2, 8), white); deck.position.y = 2.02; g.add(deck);
    for(let i=0;i<4;i++){ const a = i*TAU/4 + TAU/8;
      const top = V(Math.cos(a)*.85, 1.05, Math.sin(a)*.85), foot = V(Math.cos(a)*1.75, .08, Math.sin(a)*1.75);
      const len = top.distanceTo(foot), leg = new T.Mesh(new T.CylinderGeometry(.05, .05, len, 8), white);
      leg.position.copy(top).add(foot).multiplyScalar(.5); leg.lookAt(foot); leg.rotateX(Math.PI/2); g.add(leg);
      const pad = new T.Mesh(new T.CylinderGeometry(.22, .26, .08, 16), white); pad.position.copy(foot); pad.position.y = .04; g.add(pad); }
    const panelTex = ctex(256,128,(c,w,h)=>{ c.fillStyle = '#10204a'; c.fillRect(0,0,w,h); c.strokeStyle = '#4a6ab0'; c.lineWidth = 2;
      for(let x=0;x<=w;x+=32){ c.beginPath(); c.moveTo(x,0); c.lineTo(x,h); c.stroke(); } for(let y=0;y<=h;y+=32){ c.beginPath(); c.moveTo(0,y); c.lineTo(w,y); c.stroke(); } });
    const panelMat = new T.MeshStandardMaterial({ map:panelTex, metalness:.6, roughness:.25 });
    for(const s of [-1,1]){ const p = new T.Mesh(new T.BoxGeometry(1.9, .05, 1), panelMat); p.position.set(s*2.05, 1.85, 0); g.add(p);
      const arm = new T.Mesh(new T.BoxGeometry(.5, .06, .1), white); arm.position.set(s*1.05, 1.85, 0); g.add(arm); }
    const mast = new T.Mesh(new T.CylinderGeometry(.04,.04,.9,8), white); mast.position.set(.4, 2.55, .2); g.add(mast);
    const dish = new T.Mesh(new T.SphereGeometry(.38, 24, 12, 0, TAU, 0, Math.PI/2.6), new T.MeshStandardMaterial({ color:C('#f2f4f8'), metalness:.3, roughness:.3, side:T.DoubleSide }));
    dish.position.set(.4, 3.0, .2); dish.rotation.x = Math.PI*.8; g.add(dish);
    const cam = new T.Mesh(new T.BoxGeometry(.25,.18,.18), dark); cam.position.set(-.45, 2.55, .3); g.add(cam);
    const camMast = new T.Mesh(new T.CylinderGeometry(.03,.03,.5,8), white); camMast.position.set(-.45, 2.25, .3); g.add(camMast);
    /* hava yastıkları */
    const bags = new T.Group(), bagMat = new T.MeshStandardMaterial({ color:C('#efe6d2'), roughness:.9 });
    for(let i=0;i<6;i++){ const a = i*TAU/6; const b = new T.Mesh(new T.SphereGeometry(.95, 24, 16), bagMat); b.position.set(Math.cos(a)*1.1, 1.4 + (i%2?.5:-.3), Math.sin(a)*1.1); bags.add(b); }
    bags.visible = false; g.add(bags);
    /* retro roketler */
    const retro = [];
    for(let i=0;i<4;i++){ const a = i*TAU/4; const f = new T.Mesh(new T.ConeGeometry(.16, 1.1, 16, 1, true), flameMat('#fff3c2','#ff5a1a')); f.rotation.x = Math.PI; f.position.set(Math.cos(a)*.7, .45, Math.sin(a)*.7); g.add(f); retro.push(f); }
    g.userData = { bags, retro };
    O.lander = g;
    /* paraşüt */
    const chute = new T.Group();
    const cTex = ctex(512,64,(c,w,h)=>{ for(let i=0;i<16;i++){ c.fillStyle = i%2 ? '#f2f2f2' : '#e0452f'; c.fillRect(i*w/16,0,w/16,h); } c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(0,h*.85,w,h*.15); });
    const canopy = new T.Mesh(new T.SphereGeometry(2.6, 32, 10, 0, TAU, 0, Math.PI/2.3), new T.MeshStandardMaterial({ map:cTex, side:T.DoubleSide, roughness:.9, transparent:true }));
    canopy.scale.y = .7; canopy.position.y = 6.2; chute.add(canopy);
    const lp = [];
    for(let i=0;i<12;i++){ const a = i*TAU/12, r = 2.6*Math.sin(Math.PI/2.3); lp.push(Math.cos(a)*r, 6.2 + 2.6*Math.cos(Math.PI/2.3)*.7, Math.sin(a)*r, 0, 2.15, 0); }
    const lg = new T.BufferGeometry(); lg.setAttribute('position', new T.Float32BufferAttribute(lp, 3));
    const lines = new T.LineSegments(lg, new T.LineBasicMaterial({ color:C('#e8e8e8'), transparent:true, opacity:.7 })); chute.add(lines);
    chute.userData = { canopy, lines };
    O.chute = chute;
    /* bayrak */
    const flag = new T.Group();
    const pole = new T.Mesh(new T.CylinderGeometry(.035,.035,3.2,8), new T.MeshStandardMaterial({ color:C('#dfe3ea'), metalness:.8, roughness:.3 })); pole.position.y = 1.6; flag.add(pole);
    const fTex = ctex(300,200,(c,w,h)=>{ c.fillStyle = '#e30a17'; c.fillRect(0,0,w,h); const cx = w*.36, cy = h/2;
      c.fillStyle = '#fff'; c.beginPath(); c.arc(cx, cy, h*.25, 0, TAU); c.fill(); c.fillStyle = '#e30a17'; c.beginPath(); c.arc(cx + h*.0625, cy, h*.2, 0, TAU); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); const sx = cx + h*.28, R1 = h*.125, R2 = R1*.38; for(let i=0;i<10;i++){ const a = Math.PI + i*Math.PI/5, r = i%2 ? R2 : R1; const px = sx + Math.cos(a)*r, py = cy + Math.sin(a)*r; i ? c.lineTo(px,py) : c.moveTo(px,py); } c.closePath(); c.fill(); });
    const cloth = new T.Mesh(new T.PlaneGeometry(1.5, 1, 24, 8), new T.MeshStandardMaterial({ map:fTex, side:T.DoubleSide, roughness:.8 }));
    cloth.geometry.translate(.75, 0, 0); cloth.position.set(.035, 2.65, 0); flag.add(cloth);
    flag.userData = { cloth, base: cloth.geometry.attributes.position.array.slice() };
    O.flag = flag;
  })();

  /* --- fırlatma rampası --- */
  (function(){
    const g = new T.Group();
    const conc = ctex(512,512,(c,w,h)=>{ const id = c.createImageData(w,h); for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const n = fbm(x/40,y/40,5)*.6 + Math.random()*.25, i = (y*w+x)*4, v = 95 + n*70; id.data[i]=v; id.data[i+1]=v; id.data[i+2]=v*1.02; id.data[i+3]=255; } c.putImageData(id,0,0);
      c.strokeStyle = 'rgba(30,30,30,.4)'; c.lineWidth = 3; for(let k=0;k<=w;k+=128){ c.beginPath(); c.moveTo(k,0); c.lineTo(k,h); c.stroke(); c.beginPath(); c.moveTo(0,k); c.lineTo(w,k); c.stroke(); } }, {repeat:6});
    const ground = new T.Mesh(new T.PlaneGeometry(800, 800), new T.MeshStandardMaterial({ color:C('#3a4438'), roughness:1 })); ground.rotation.x = -Math.PI/2; g.add(ground);
    const padM = new T.MeshStandardMaterial({ map:conc, roughness:.95 });
    const pad = new T.Mesh(new T.CylinderGeometry(9, 9.6, .4, 48), padM); pad.position.y = .2; g.add(pad);
    const plat = new T.Mesh(new T.BoxGeometry(2.4, .5, 2.4), new T.MeshStandardMaterial({ color:C('#55595f'), metalness:.6, roughness:.5 })); plat.position.y = .65; g.add(plat);
    /* kule (kafes) */
    const steel = new T.MeshStandardMaterial({ color:C('#9aa1ad'), metalness:.8, roughness:.4 });
    const tower = new T.Group(), H = 7.6, wd = .8;
    for(const [x,z] of [[0,0],[wd,0],[0,wd],[wd,wd]]){ const p = new T.Mesh(new T.BoxGeometry(.07, H, .07), steel); p.position.set(x, H/2, z); tower.add(p); }
    for(let y=.5; y<H; y+=.6){ for(const [x,z,rx,ry] of [[wd/2,0,wd,.05],[wd/2,wd,wd,.05]]){ const b = new T.Mesh(new T.BoxGeometry(rx,.05,.05), steel); b.position.set(x,y,z); tower.add(b); }
      for(const x of [0,wd]){ const b = new T.Mesh(new T.BoxGeometry(.05,.05,wd), steel); b.position.set(x,y,wd/2); tower.add(b); }
      const d = new T.Mesh(new T.BoxGeometry(.04, .85, .04), steel); d.position.set(wd/2, y+.3, 0); d.rotation.z = .9; tower.add(d); }
    const arm = new T.Mesh(new T.BoxGeometry(1.25, .18, .3), steel); arm.position.set(-.55, 5.3, wd/2); tower.add(arm);
    const lamp = new T.Mesh(new T.SphereGeometry(.09, 12, 8), new T.MeshBasicMaterial({ color:C('#ff3030').multiplyScalar(6) })); lamp.position.set(wd/2, H+.12, wd/2); tower.add(lamp);
    tower.position.set(1.55, .4, -wd/2); g.add(tower);
    /* uzak tepeler */
    const hills = new T.Group(), hm = new T.MeshStandardMaterial({ color:C('#2b3328'), roughness:1 });
    for(let i=0;i<40;i++){ const a = rnd(0,TAU), r = rnd(140,220), h = rnd(10,34); const m = new T.Mesh(new T.ConeGeometry(rnd(30,60), h, 24, 1), hm); m.scale.z = rnd(.5,1); m.position.set(Math.cos(a)*r, h/2 - 2, Math.sin(a)*r); m.rotation.y = rnd(0,TAU); hills.add(m); }
    g.add(hills);
    g.userData = { arm, lamp };
    O.pad = g;
    O.padSky = new T.Mesh(new T.SphereGeometry(1000, 32, 16), skyMat());
    /* bulutlar */
    const clouds = new T.Group();
    for(let i=0;i<16;i++){ const s = new T.Sprite(new T.SpriteMaterial({ map:CLOUD, transparent:true, depthWrite:false, fog:false })); const a = rnd(-.9,.9);
      s.position.set(Math.sin(a)*rnd(120,260) + rnd(-60,60), rnd(28,70), -Math.cos(a)*rnd(120,260)); s.scale.set(rnd(90,160), rnd(40,60), 1); s.userData.v = rnd(1.5,4); clouds.add(s); }
    O.clouds = clouds;
    /* yağmur */
    const N = 1400, rp = new Float32Array(N*6), drops = [];
    for(let i=0;i<N;i++) drops.push({x:rnd(-30,30), y:rnd(0,30), z:rnd(-20,14)});
    const rg = new T.BufferGeometry(); rg.setAttribute('position', new T.BufferAttribute(rp,3).setUsage(T.DynamicDrawUsage));
    O.rain = new T.LineSegments(rg, new T.LineBasicMaterial({ color:C('#a9bbd8'), transparent:true, opacity:.35, depthWrite:false })); O.rain.frustumCulled = false; O.rain.userData = {drops, rp, rg};
    /* yıldırım */
    const bg = new T.BufferGeometry(); bg.setAttribute('position', new T.BufferAttribute(new Float32Array(40*3),3).setUsage(T.DynamicDrawUsage));
    O.bolt = new T.Line(bg, new T.LineBasicMaterial({ color:C('#dfe8ff').multiplyScalar(8), transparent:true, opacity:1 })); O.bolt.frustumCulled = false;
  })();

  /* --- Mars yüzeyi --- */
  (function(){
    const g = new T.Group();
    const S = 340, geo = new T.PlaneGeometry(S, S, 220, 220); geo.rotateX(-Math.PI/2);
    const p = geo.attributes.position, col = new Float32Array(p.count*3);
    const cA = C('#b45a33'), cB = C('#7b3a22'), cC = C('#d9946a'), cD = C('#5a2a18'), tc = new T.Color();
    for(let i=0;i<p.count;i++){
      const x = p.getX(i), z = p.getZ(i), d = Math.hypot(x, z + 10);
      const flat = clamp((d - 14)/50, 0, 1);
      let h = (fbm(x*.010+5, z*.010+2, 4) - .45)*15*flat*flat + (fbm(x*.08, z*.08, 4)-.5)*.9;
      p.setY(i, h);
      const n = fbm(x*.05+9, z*.05, 4);
      tc.copy(cA).lerp(cB, clamp((n-.4)*2.2,0,1)).lerp(cC, clamp((h/10),0,.6)).lerp(cD, clamp((-h-1)/4, 0, .5));
      col.set([tc.r, tc.g, tc.b], i*3);
    }
    geo.setAttribute('color', new T.BufferAttribute(col,3)); geo.computeVertexNormals();
    const detail = ctex(512,512,(c,w,h)=>{ const id = c.createImageData(w,h); for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const n = fbm(x/18,y/18,5)*.7 + Math.random()*.3, i = (y*w+x)*4, v = 150 + n*105; id.data[i]=v; id.data[i+1]=v*.96; id.data[i+2]=v*.92; id.data[i+3]=255; } c.putImageData(id,0,0); }, {repeat:40});
    const ter = new T.Mesh(geo, new T.MeshStandardMaterial({ vertexColors:true, map:detail, roughness:1, metalness:0 }));
    g.add(ter);
    const rgeo = new T.DodecahedronGeometry(1, 1), rp = rgeo.attributes.position;
    for(let i=0;i<rp.count;i++){ const v = V(rp.getX(i), rp.getY(i), rp.getZ(i)); v.multiplyScalar(1 + (fbm(v.x*2+1, v.y*2+v.z, 3)-.5)*.6); rp.setXYZ(i, v.x, v.y*.6, v.z); }
    rgeo.computeVertexNormals();
    const N = 260, rocks = new T.InstancedMesh(rgeo, new T.MeshStandardMaterial({ color:C('#6a3420'), roughness:1, flatShading:true }), N), m = new T.Matrix4(), q = new T.Quaternion();
    for(let i=0;i<N;i++){ let x, z; do { x = rnd(-90,90); z = rnd(-120,30); } while(Math.hypot(x, z) < 6);
      const s = Math.pow(Math.random(),3)*1.6 + .12; q.setFromEuler(new T.Euler(rnd(0,TAU), rnd(0,TAU), 0));
      m.compose(V(x, s*.25 + (fbm(x*.012+5, z*.012+2, 6) - .45)*0, z), q, V(s, s, s)); rocks.setMatrixAt(i, m); }
    g.add(rocks);
    O.marsGround = g;
    O.marsSky = new T.Mesh(new T.SphereGeometry(1000, 32, 16), skyMat());
  })();

  /* --- sinyal halkaları, takımyıldız, yörünge çizgisi, rota çizgisi --- */
  O.rings = Array.from({length:4}, () => { const m = new T.Mesh(new T.RingGeometry(.92, 1, 64), new T.MeshBasicMaterial({ color:C('#6dffc4').multiplyScalar(3), transparent:true, opacity:0, ...ADD, depthWrite:false, side:T.DoubleSide })); m.userData.age = 99; return m; });
  O.beacon = new T.Sprite(new T.SpriteMaterial({ map:SOFT, color:C('#7dffc8').multiplyScalar(4), ...ADD, depthWrite:false, transparent:true }));
  (function(){
    const pts = Array.from({length:7}, (_,i) => V(-6 + i*3.2 + rnd(-1,1), 6 + (i%3)*1.6 + rnd(-.6,.6), -30));
    const geo = new T.BufferGeometry().setFromPoints(pts);
    O.constel = new T.Line(geo, new T.LineBasicMaterial({ color:C('#9fd0ff').multiplyScalar(2), transparent:true, opacity:.7 }));
    O.constelPts = pts;
    const curve = new T.QuadraticBezierCurve3(V(-10,-2,-9), V(0,7,-11), V(10.5,3.2,-13));
    const cg = new T.BufferGeometry().setFromPoints(curve.getPoints(80));
    O.route = new T.Line(cg, new T.LineDashedMaterial({ color:C('#ffd29a').multiplyScalar(1.5), dashSize:.4, gapSize:.35, transparent:true, opacity:.8 })); O.route.computeLineDistances();
  })();
  O.shock = new T.Mesh(new T.RingGeometry(.85, 1, 64), new T.MeshBasicMaterial({ color:C('#ffd9a0').multiplyScalar(3), transparent:true, opacity:0, ...ADD, depthWrite:false, side:T.DoubleSide }));
  scn.add(O.shock);
  O.debris = Array.from({length:18}, () => { const m = new T.Mesh(new T.BoxGeometry(rnd(.1,.35), rnd(.05,.18), rnd(.1,.3)), new T.MeshStandardMaterial({ color:C(pick(['#e8ebf2','#9aa1ad','#c8322a','#2f5fd0'])), metalness:.6, roughness:.4 })); m.visible = false; m.userData = {}; scn.add(m); return m; });

  /* --- ışık hızı çizgileri --- */
  (function(){
    const N = 900, pos = new Float32Array(N*6), col = new Float32Array(N*6), seg = [];
    for(let i=0;i<N;i++){ const a = rnd(0,TAU), r = rnd(1.2, 14); seg.push({x:Math.cos(a)*r, y:Math.sin(a)*r, z:rnd(-220, 4)});
      const c = C(pick(['#cfe0ff','#9fc0ff','#ffffff','#b9a8ff'])); col.set([c.r*.2,c.g*.2,c.b*.2, c.r,c.g,c.b], i*6); }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos,3).setUsage(T.DynamicDrawUsage)); geo.setAttribute('color', new T.BufferAttribute(col,3));
    O.warp = new T.LineSegments(geo, new T.LineBasicMaterial({ vertexColors:true, transparent:true, opacity:1, ...ADD, depthWrite:false })); O.warp.frustumCulled = false;
    O.warp.userData = {seg, pos, geo};
  })();

  /* =====================================================================
     SAHNE KURULUMU
     ===================================================================== */
  const camBase = { pos:V(0,0,10), tgt:V(0,0,0) };
  let fit = 1;
  function setCam(pos, tgt){ camBase.pos.copy(pos); camBase.tgt.copy(tgt); }
  const acc = {};
  function rateDo(key, r, fn){ acc[key] = (acc[key]||0) + r*E.dt; while(acc[key] >= 1){ acc[key]--; fn(); } }

  function reset(){
    while(root.children.length) root.remove(root.children[0]);
    if(O.rocket.parent) O.rocket.parent.remove(O.rocket);
    if(O.dustLayer.parent) O.dustLayer.parent.remove(O.dustLayer);
    E.repairDone = false;
    while(tmp.children.length) tmp.remove(tmp.children[0]);
    FX.clear(); SMK.clear(); for(const k in acc) delete acc[k];
    for(const d of O.debris) d.visible = false;
    O.shock.material.opacity = 0; boomLight.intensity = 0;
    const u = O.rocket.userData; u.shield.visible = false; u.plasma.visible = false; u.warn.visible = false; u.warnL.intensity = 0;
    O.rocket.visible = true; O.rocket.position.set(0,0,0); O.rocket.rotation.set(0,0,0); O.rocket.scale.setScalar(1); throttle(0);
    O.lander.visible = true; O.lander.position.set(0,0,0); O.lander.rotation.set(0,0,0); O.lander.userData.bags.visible = false; O.lander.userData.retro.forEach(f => f.visible = false);
    O.chute.visible = true; O.chute.position.set(0,0,0); O.chute.rotation.set(0,0,0); O.chute.userData.canopy.material.opacity = 1; O.chute.userData.lines.material.opacity = .7;
    O.flag.scale.set(1,1,1);
    scn.fog = null; scn.environment = null;
    hemi.intensity = .4; sun.intensity = 2.5;
    E.state = 'idle'; E.st = 0; E.ev = {}; E.shield = false; E.bags = false; E.tension = 0; E.chuteFree = null; E.bolt = 0;
    bloom.strength = .85; bloom.threshold = 1.0;
  }

  function useSpace(envKey){ root.add(O.space); scn.background = C('#000000'); scn.environment = env('space', SPACE_ENV);
    hemi.color.set('#8090b0'); hemi.groundColor.set('#101018'); hemi.intensity = .25;
    sun.color.set('#fff2dd'); sun.intensity = 1.35; sun.position.set(-12, 5, 8); sun.target.position.set(0,0,0); }

  const PAD_SKY = {
    wind:  { top:'#2f5fae', mid:'#f0a070', bot:'#3a3530', sun:V(-.8,.06,-1), sunCol:'#fff0d0', sunSize:900, halo:'#ffb070', fog:'#d89a78', light:'#ffd2a0', li:1.5, hemiTop:'#9cb8e8', hemiBot:'#5a4a40', hi:.7 },
    sensor:{ top:'#060b22', mid:'#2a3a6a', bot:'#0e1220', sun:V(.9,-.05,-1), sunCol:'#ffffff', sunSize:2000, halo:'#3a4a8a', fog:'#1e2a4a', light:'#9ab0ff', li:.7, hemiTop:'#5a6aa0', hemiBot:'#151820', hi:.6 },
    storm: { top:'#1a1e28', mid:'#4a5262', bot:'#22262e', sun:V(0,1,0), sunCol:'#000000', sunSize:10, halo:'#000000', fog:'#3a404c', light:'#c8d2e6', li:.9, hemiTop:'#8a94a8', hemiBot:'#2a2e36', hi:.75 }
  };
  const MARS_SKY = {
    day:    { top:'#b07a5a', mid:'#e8b48a', bot:'#7a4a30', sun:V(1.2,.5,-1), sunCol:'#fffaf0', sunSize:2500, halo:'#ffe2c0', fog:'#dca47c', light:'#fff0dc', li:1.5, hemiTop:'#e8b896', hemiBot:'#6a3a24', hi:.65 },
    sunset: { top:'#1c2548', mid:'#b88a78', bot:'#3a2018', sun:V(.3,.05,-1), sunCol:'#f0f8ff', sunSize:1800, halo:'#7ab0ff', fog:'#9a7472', light:'#d8e4ff', li:1.35, hemiTop:'#6a78a8', hemiBot:'#4a2418', hi:.55 }
  };
  function applySky(mesh, o, envKey){
    setSky(mesh.material, o); root.add(mesh); scn.background = null; scn.fog = new T.Fog(C(o.fog), 40, 330);
    scn.environment = env(envKey, o);
    sun.color.set(o.light); sun.intensity = o.li; sun.position.copy(o.sun).normalize().multiplyScalar(50); if(sun.position.y < 4) sun.position.y = 4; sun.target.position.set(0,0,0);
    hemi.color.set(o.hemiTop); hemi.groundColor.set(o.hemiBot); hemi.intensity = o.hi;
  }

  function setup(kind){
    reset(); E.kind = kind;
    const [grp, sub] = kind.split('-'); E.grp = grp; E.sub = sub;
    if(grp==='pad'){
      const o = PAD_SKY[sub]; applySky(O.padSky, o, 'pad-'+sub);
      root.add(O.pad); root.add(O.rocket); O.rocket.position.set(0, 3.5, 0);
      if(sub!=='sensor') root.add(O.clouds); O.clouds.children.forEach(c => { c.material.color.set(sub==='storm' ? '#3a3f4a' : '#ffe3d0'); c.material.opacity = sub==='storm' ? .95 : .7; });
      if(sub==='storm') root.add(O.rain);
      if(sub==='sensor'){ O.rocket.userData.warn.visible = true; }
      if(sub==='storm'){ root.add(O.bolt); O.bolt.visible = false; E.nextBolt = rnd(.6, 1.6); }
      O.pad.userData.arm.visible = true;
      /* rampa projektörleri */
      for(const [i, x] of [[0,-9],[1,7]]){ const f = floods[i]; root.add(f); root.add(f.target); f.position.set(x, 1.2, 9); f.target.position.set(0, 3.2, 0);
        f.intensity = sub==='sensor' ? 3.2 : sub==='storm' ? 2.2 : .9; }
      setCam(V(-4.6, 3.0, 11.5), V(.3, 3.6, 0));
    }
    else if(grp==='space'){
      useSpace(); root.add(O.dust); root.add(O.rocket);
      O.rocket.rotation.z = -Math.PI/2; O.rocket.position.set(-1.8, 0, 0);
      if(sub==='meteor'){ root.add(O.rocks); O.rocks.userData.rocks.forEach((r,i) => Object.assign(r, newRock(true))); }
      if(sub==='moon'){ root.add(O.moon); O.moon.position.set(15, -6, -22); O.moon.scale.setScalar(11); O.moon.rotation.y = 2.2; sun.position.set(-14, 4, 6); }
      if(sub==='fuel'){ root.add(O.earth); O.earth.position.set(-11, -3.6, -9); O.earth.scale.setScalar(2.6); root.add(O.mars); O.mars.position.set(10.5, 3.2, -13); O.mars.scale.setScalar(1.3); root.add(O.route); }
      if(sub==='sunstorm'){ root.add(O.sun); O.sun.position.set(-30, 4, -22); O.sun.scale.setScalar(4.2); sun.position.set(-30, 4, -22); sun.intensity = 1.9; sun.color.set('#ffe0b0'); bloom.strength = 1.1; }
      if(sub==='signal'){ root.add(O.beacon); O.beacon.position.set(13, 4.5, -24); O.beacon.scale.setScalar(1.6); O.rings.forEach(r => { root.add(r); r.position.copy(O.beacon.position); r.userData.age = 99; }); E.nextRing = 0; }
      if(sub==='computer'){ root.add(O.constel); O.rocket.userData.warn.visible = true; }
      setCam(V(-1, 1.6, 10.5), V(.8, 0, 0));
    }
    else if(grp==='orbit'){
      useSpace(); root.add(O.dust); root.add(O.mars); root.add(O.rocket);
      O.mars.position.set(12, -31, -16); O.mars.scale.setScalar(30); O.mars.rotation.set(.25, 1.2, 0);
      sun.position.set(-20, 14, 10);
      if(sub==='dust') O.mars.userData.mesh.add(O.dustLayer);
      if(sub==='phobos'){ root.add(O.phobos); O.phobos.position.set(3.5, 3.6, -12); O.phobos.scale.setScalar(1.1); }
      O.rocket.rotation.z = -Math.PI/2 - .12; O.rocket.position.set(-2.6, .9, 0);
      setCam(V(-.8, 1.8, 11), V(.6, -.2, 0));
    }
    else if(grp==='land' || kind==='end-win'){
      const o = kind==='end-win' ? MARS_SKY.sunset : MARS_SKY.day; applySky(O.marsSky, o, kind==='end-win' ? 'mars-sunset' : 'mars-day');
      root.add(O.marsGround); root.add(O.lander); root.add(O.chute);
      E.hover = 5.2; O.lander.position.set(0, E.hover, 0); O.lander.rotation.y = .5;
      if(kind==='end-win'){ E.state = 'landed'; O.lander.position.y = 0; O.chute.visible = false; root.add(O.flag); O.flag.position.set(3.1, 0, 1.2); O.flag.rotation.y = -.4; O.flag.scale.y = 1;
        setCam(V(-6, 2.6, 12), V(.8, 2.4, 0)); }
      else setCam(V(-4.5, 6.5, 21), V(0, 6.6, 0));
    }
    else if(kind==='end-fail'){
      useSpace(); root.add(O.mars); O.mars.position.set(14, 5, -40); O.mars.scale.setScalar(4); root.add(O.rocket);
      O.rocket.position.set(0, 0, 0); throttle(0);
      O.debris.forEach(d => { d.visible = true; d.position.set(rnd(-8,8), rnd(-4,4), rnd(-6,3)); d.userData = { v:V(rnd(-.4,.4), rnd(-.3,.3), rnd(-.3,.3)), w:V(rnd(-1,1), rnd(-1,1), rnd(-1,1)), life:1e9, g:0 }; });
      setCam(V(0, 1, 11), V(0, 0, 0));
    }
    else if(kind==='intro'){
      useSpace(); root.add(O.earth); O.earth.position.set(-8.5, -2, -5); O.earth.scale.setScalar(3.2);
      root.add(O.mars); O.mars.position.set(10, .8, -9); O.mars.scale.setScalar(3.8); O.mars.rotation.set(.2, 0, 0);
      root.add(O.rocket); O.rocket.scale.setScalar(.55); sun.position.set(-6, 3, 10);
      setCam(V(0, .8, 17), V(0, .3, -3));
    }
    resize();
  }

  /* =====================================================================
     PATLAMA, KIVILCIM
     ===================================================================== */
  function explode(p, s=1, grav=0){
    E.flash = .35; E.shake = .4; if(typeof sndBoom==='function') sndBoom();
    boomLight.position.copy(p); boomLight.intensity = 14;
    for(let i=0;i<150;i++){ const d = V(rnd(-1,1), rnd(-1,1), rnd(-1,1)).normalize().multiplyScalar(rnd(3,15)*s);
      FX.spawn({ x:p.x, y:p.y, z:p.z, vx:d.x, vy:d.y, vz:d.z, life:rnd(.5,1.4), s:rnd(.08,.22)*s, c0:pick(['#fff6d0','#ffd070','#ffa040']), c1:'#ff2a10', drag:1.6, g:grav*.5 }); }
    for(let i=0;i<22;i++){ const d = V(rnd(-1,1), rnd(-1,1), rnd(-1,1)).normalize().multiplyScalar(rnd(1,4.5)*s);
      FX.spawn({ x:p.x, y:p.y, z:p.z, vx:d.x, vy:d.y, vz:d.z, life:rnd(.45,1), s:rnd(.8,1.7)*s, grow:1.6*s, c0:pick(['#ffb050','#ff9030','#ffd080']), c1:'#5a1004', a:.55, drag:1.4 }); }
    for(let i=0;i<22;i++){ const d = V(rnd(-1,1), rnd(-.6,1), rnd(-1,1)).normalize().multiplyScalar(rnd(.6,2.6)*s);
      SMK.spawn({ x:p.x, y:p.y, z:p.z, vx:d.x, vy:d.y + (grav?.6:0), vz:d.z, life:rnd(1.6,3), s:rnd(.6,1.3)*s, grow:1.1*s, c0:'#2a2526', c1:'#5a5a62', a:.4, drag:.8, fadeIn:1 }); }
    O.debris.forEach(d => { d.visible = true; d.position.copy(p); const v = V(rnd(-1,1), rnd(-.3,1), rnd(-1,1)).normalize().multiplyScalar(rnd(3,9)*s);
      d.userData = { v, w:V(rnd(-8,8), rnd(-8,8), rnd(-8,8)), life:grav ? 3 : 5, g:grav }; });
    O.shock.position.copy(p); O.shock.scale.setScalar(.3); O.shock.material.opacity = 1; O.shock.userData.s = s;
  }
  E.sparkle = function(){
    if(!E.kind) return;
    E.repairDone = true;
    const p =(E.grp==='land') ? O.lander.position.clone().add(V(0,1.6,0)) : O.rocket.position.clone();
    for(let i=0;i<70;i++){ const d = V(rnd(-1,1), rnd(-1,1), rnd(-1,1)).normalize().multiplyScalar(rnd(1,4));
      FX.spawn({ x:p.x, y:p.y, z:p.z, vx:d.x, vy:d.y, vz:d.z, life:rnd(.5,1.1), s:rnd(.06,.14), c0:pick(['#ffe08a','#fff','#ffb454']), drag:2.2 }); }
  };

  /* =====================================================================
     GÜNCELLEME
     ===================================================================== */
  function update(dt){
    E.dt = dt; E.t += dt; E.st += dt;
    E.shake = Math.max(0, E.shake - dt*1.2); E.flash = Math.max(0, E.flash - dt*2.4);
    boomLight.intensity *= Math.pow(.004, dt);
    O.starMat.uniforms.t.value = E.t;
    const u = O.rocket.userData;
    u.shield.visible = !!E.shield && O.rocket.visible; u.shield.material.uniforms.t.value = E.t;
    if(u.warn.visible){ const on = Math.sin(E.t*9) > 0; u.warn.material.color.set(on ? '#ff2a2a' : '#300000').multiplyScalar(on ? 6 : 1); u.warnL.intensity = on ? 3 : 0; }

    if(E.warpT >= 0) return updWarp(dt);
    const g = E.grp, s = E.state, st = E.st;

    if(g==='pad'){
      const r = O.rocket; let th = 0;
      for(const c of O.clouds.children){ c.position.x += c.userData.v*(E.sub==='wind'?4:1)*dt; if(c.position.x > 300) c.position.x = -300; }
      O.pad.userData.lamp.material.color.set(Math.sin(E.t*4) > 0 ? '#ff3030' : '#300808').multiplyScalar(Math.sin(E.t*4) > 0 ? 6 : 1);
      if(E.sub==='storm'){
        const d = O.rain.userData;
        d.drops.forEach((p,i) => { p.y -= 28*dt; p.x -= 4*dt; if(p.y < 0){ p.y += 30; p.x = rnd(-30,30); } d.rp.set([p.x,p.y,p.z, p.x+.12,p.y+.9,p.z], i*6); });
        d.rg.attributes.position.needsUpdate = true;
        E.nextBolt -= dt;
        if(E.nextBolt <= 0){ E.nextBolt = rnd(1.6,3.8); const arr = O.bolt.geometry.attributes.position.array; let x = rnd(-60,60), y = 70, z = rnd(-120,-60);
          for(let i=0;i<40;i++){ arr.set([x,y,z], i*3); x += rnd(-4,4); y -= 70/39; z += rnd(-2,2); } O.bolt.geometry.attributes.position.needsUpdate = true;
          O.bolt.visible = true; E.bolt = .22; E.flash = Math.max(E.flash, .25); hemi.intensity = 2.4; if(typeof sndThunder==='function') sndThunder(); }
        if(E.bolt > 0){ E.bolt -= dt; if(E.bolt <= 0){ O.bolt.visible = false; } }
        hemi.intensity += (PAD_SKY.storm.hi - hemi.intensity)*Math.min(1, dt*6);
      }
      if(E.sub==='wind') rateDo('wind', 30, () => SMK.spawn({ x:-25, y:rnd(.5,12), z:rnd(-10,6), vx:rnd(22,34), vy:0, vz:0, life:1.6, s:rnd(.05,.1), c0:'#ffffff', a:.35 }));
      if(s!=='success') rateDo('vapor', E.sub==='sensor' ? 18 : 8, () => SMK.spawn({ x:rnd(-.6,.6), y:.9, z:rnd(-.6,.6), vx:rnd(-.6,.6), vy:rnd(.3,.9), vz:rnd(-.6,.6), life:2.6, s:.5, grow:.9, c0:'#e8ecf2', a:.32, fadeIn:1 }));
      r.position.set(0, 3.5, 0); r.rotation.set(0,0,0);
      if(E.tension){ r.position.x += rnd(-.02,.02); }
      if(s==='success'){
        th = Math.min(1.25, st*2.2); const rise = st < .7 ? 0 : Math.pow(st-.7, 2)*7; r.position.y += rise;
        if(st > .35) O.pad.userData.arm.visible = false;
        if(st < 2.2) rateDo('smk', 95, () => { const a = rnd(0,TAU), sp = rnd(4,10); SMK.spawn({ x:rnd(-.4,.4), y:.8, z:rnd(-.4,.4), vx:Math.cos(a)*sp, vy:rnd(0,1.2), vz:Math.sin(a)*sp, life:rnd(2.2,3.6), s:rnd(.8,1.6), grow:1.6, c0:pick(['#f2f2f4','#dedfe4','#ffd6b0']), c1:'#b8bcc4', a:.55, drag:.9, fadeIn:1 }); });
        exhaust(140, 10, .45); if(st < 1.8) E.shake = Math.max(E.shake, .07);
        camBase.tgt.y = 3.6 + Math.min(5, Math.max(0, r.position.y - 3.5)*.5);
      } else if(s==='fail'){
        th = st < .7 ? .25 + Math.random()*.45 : 0; const k = Math.min(st,.7); r.rotation.z = -k*.5; r.position.x += k*.6; r.position.y += st < .7 ? st*.8 : 0;
        if(st < .7) exhaust(50, 5, .35);
        if(st >= .7 && !E.ev.boom){ E.ev.boom = 1; explode(r.position.clone().add(V(0,.5,0)), 1.4, -9); r.visible = false; }
      } else camBase.tgt.y = 3.6;
      throttle(r.visible ? th : 0);
    }

    else if(g==='space'){
      const r = O.rocket; let th = .8, speed = 6;
      r.position.set(-1.8, Math.sin(E.t*1.2)*.12, 0); r.rotation.set(Math.sin(E.t*.7)*.06, 0, -Math.PI/2 + Math.sin(E.t*.9)*.03);
      if(E.tension){ r.position.x += rnd(-.025,.025); r.position.y += rnd(-.02,.02); }
      if(E.sub==='meteor'){ const im = O.rocks, m = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler();
        im.userData.rocks.forEach((k,i) => { k.x += (k.vx - (s==='success' ? st*12 : 0))*dt; k.y += k.vy*dt; k.rx += k.vr*dt; k.ry += k.vr*.7*dt;
          if(E.shield && r.visible){ const dx = k.x - r.position.x, dy = k.y - r.position.y, dz = k.z; const d = Math.hypot(dx,dy,dz); if(d < 2.4 + k.s){ k.vy = Math.sign(dy||1)*rnd(2,4); k.vx = Math.abs(k.vx)*.3; } }
          if(k.x < -30) Object.assign(k, newRock(false));
          e.set(k.rx, k.ry, 0); q.setFromEuler(e); m.compose(V(k.x,k.y,k.z), q, V(k.s,k.s,k.s)); im.setMatrixAt(i, m); });
        im.instanceMatrix.needsUpdate = true; }
      if(E.sub==='moon') O.moon.rotation.y += dt*.02;
      if(E.sub==='fuel'){ O.earth.rotation.y += dt*.1; O.mars.rotation.y += dt*.06; }
      if(E.sub==='sunstorm'){ rateDo('sun', 160, () => { const p = O.sun.position; FX.spawn({ x:p.x+rnd(-2,2), y:p.y+rnd(-5,5), z:p.z+rnd(-2,2), vx:rnd(16,26), vy:rnd(-1.6,.6), vz:rnd(5,9), life:3.5, s:rnd(.05,.14), c0:pick(['#ffe2a0','#ffc070','#fff']), sun:1 }); });
        for(const p of FX.p) if(p.sun && E.shield && r.visible && !p.hit){ const dx = p.x - r.position.x, dy = p.y - r.position.y, dz = p.z - r.position.z; if(dx*dx + dy*dy + dz*dz < 5.5){ p.hit = 1; p.vx = -Math.abs(p.vx)*.25; p.vy = Math.sign(dy||1)*rnd(4,8); p.c0.set('#9fe6ff'); } } }
      if(E.sub==='signal'){ E.nextRing -= dt; if(E.nextRing <= 0){ E.nextRing = 1.1; const ring = O.rings.find(q => q.userData.age > 4); if(ring) ring.userData.age = 0; }
        O.beacon.material.opacity = .5 + .5*Math.max(0, Math.sin(E.t*6));
        O.rings.forEach(q => { q.userData.age += dt; const a = q.userData.age; q.scale.setScalar(.3 + a*3.2); q.material.opacity = Math.max(0, 1 - a/2.6); q.lookAt(cam.position); }); }
      if(E.sub==='micro'){ rateDo('mm', 10, () => FX.spawn({ x:rnd(4,22), y:rnd(4,9), z:rnd(-8,2), vx:-rnd(28,40), vy:-rnd(8,14), vz:0, life:1, s:.09, c0:'#ffe0c0' }));
        if(!E.repairDone && s!=='success') rateDo('leak', 9, () => { const p = r.position; SMK.spawn({ x:p.x+.5, y:p.y+.45, z:p.z+.2, vx:rnd(-.5,.3), vy:rnd(1,2), vz:rnd(0,.8), life:1.6, s:.18, grow:.6, c0:'#f0f4ff', a:.5 }); }); }
      if(E.sub==='computer'){ const n = Math.floor(E.t*2.2) % (O.constelPts.length + 3); O.constel.geometry.setDrawRange(0, Math.min(n, O.constelPts.length)); }
      if(s==='success'){ th = .55 + Math.min(1.1, st*1.8); r.position.x += Math.pow(st, 2.2)*5.5; speed = 6 + Math.min(70, st*45); }
      if(s==='fail'){ if(st < .55){ th = Math.random() < .5 ? .1 : .8; r.rotation.x += st*1.5; r.position.y += rnd(-.04,.04); }
        if(st >= .55 && !E.ev.boom){ E.ev.boom = 1; explode(r.position.clone(), 1, 0); r.visible = false; } speed = r.visible ? 6 : 1.5; }
      updDust(dt, speed);
      if(r.visible){ throttle(th); exhaust(40 + th*60, 6 + th*5, .3); }
    }

    else if(g==='orbit'){
      const r = O.rocket; let th = .45;
      O.mars.rotation.y += dt*.012; if(E.sub==='dust') O.dustLayer.rotation.y += dt*.03;
      if(E.sub==='phobos'){ O.phobos.rotation.y += dt*.15; O.phobos.rotation.x += dt*.05; }
      r.position.set(-2.6, .9 + Math.sin(E.t)*.1, 0); r.rotation.set(0, 0, -Math.PI/2 - .12); r.scale.setScalar(1);
      if(E.tension) r.position.x += rnd(-.02,.02);
      let plasma = E.sub==='aero' && (E.tension || s==='fail' || (s==='success' && st < 1.8));
      if(s==='success'){ const e = ease(Math.min(1, st/2.4)); r.position.x += e*5.5; r.position.y -= e*1.1; r.position.z -= e*8; r.rotation.z -= e*.25; th = .45 + .6*(1-e); }
      if(s==='fail'){ if(st < .55){ th = Math.random()<.5 ? .1 : .9; r.rotation.x += st*1.4; } if(st >= .55 && !E.ev.boom){ E.ev.boom = 1; explode(r.position.clone(), 1, 0); r.visible = false; } }
      const pl = r.userData.plasma; pl.visible = plasma && r.visible; if(pl.visible){ pl.material.uniforms.s.value = 1.6 + Math.random()*.8; bloom.strength = 1.15; } else bloom.strength = .9;
      updDust(dt, 3);
      if(r.visible){ throttle(th); exhaust(50, 6, .3); }
    }

    else if(g==='land' || E.kind==='end-win'){
      const L = O.lander, ch = O.chute, hy = E.hover;
      L.userData.bags.visible = !!E.bags && (s!=='landed');
      rateDo('drift', 14, () => SMK.spawn({ x:rnd(-30,-10), y:rnd(.2,6), z:rnd(-20,8), vx:rnd(2,4), vy:rnd(-.1,.2), vz:0, life:6, s:rnd(.05,.12), c0:'#ffd2aa', a:.5 }));
      let y = hy + Math.sin(E.t*1.1)*.25, chuteOn = true, retro = false;
      if(E.tension) L.position.x = rnd(-.02,.02); else L.position.x = 0;
      if(s==='success'){ const e = ease(Math.min(1, st/1.9)); y = hy*(1-e);
        if(st >= 1.1){ chuteOn = false; if(!E.ev.cd){ E.ev.cd = 1; E.chuteFree = { y:ch.position.y, t:0 }; } }
        retro = st > 1.15 && st < 1.9;
        if(st >= 1.9 && !E.ev.land){ E.ev.land = 1; E.shake = .12;
          for(let i=0;i<90;i++){ const a = rnd(0,TAU), sp = rnd(2,7); SMK.spawn({ x:Math.cos(a)*1.2, y:.2, z:Math.sin(a)*1.2, vx:Math.cos(a)*sp, vy:rnd(.2,1.4), vz:Math.sin(a)*sp, life:rnd(1.6,3), s:rnd(.5,1.1), grow:1.2, c0:pick(['#c98a5e','#a8633e','#e2a676']), a:.55, drag:1.4, fadeIn:1 }); } }
        if(st >= 2.3 && !E.ev.flag){ E.ev.flag = 1; root.add(O.flag); O.flag.position.set(3.1, 0, 1.2); O.flag.rotation.y = -.4; O.flag.scale.y = .01; }
        if(E.ev.flag) O.flag.scale.y = Math.min(1, O.flag.scale.y + dt*2.5);
      }
      if(s==='landed'){ y = 0; chuteOn = false; }
      if(s==='fail'){
        if(st >= .35){ chuteOn = false; if(!E.ev.cd){ E.ev.cd = 1; E.chuteFree = { y:ch.position.y, t:0, torn:1 }; } }
        const f = Math.max(0, st-.35); y = hy - f*f*9; L.rotation.z = -f*.35;
        if(y <= 0 && !E.ev.boom){ E.ev.boom = 1; explode(V(L.position.x, 1.2, 0), 1.3, -9); L.visible = false; }
        if(E.ev.boom) y = 0;
      }
      L.position.y = Math.max(0, y);
      L.userData.retro.forEach(f => { f.visible = retro; if(retro){ f.material.uniforms.k.value = .8 + Math.random()*.4; f.material.uniforms.t.value = E.t; } });
      if(retro) rateDo('rdust', 40, () => { const a = rnd(0,TAU), sp = rnd(2,5); SMK.spawn({ x:Math.cos(a), y:.15, z:Math.sin(a), vx:Math.cos(a)*sp, vy:rnd(.1,.6), vz:Math.sin(a)*sp, life:1.5, s:.6, grow:1, c0:'#c98a5e', a:.4, fadeIn:1 }); });
      if(chuteOn){ ch.visible = true; ch.position.set(L.position.x, L.position.y, 0); ch.rotation.z = Math.sin(E.t*1.3)*.05; }
      else if(E.chuteFree){ const c = E.chuteFree; c.t += dt; ch.position.x += (c.torn ? 1.5 : 3)*dt; ch.position.y += (c.torn ? 9 : 2.2)*dt; ch.rotation.z -= dt*(c.torn ? 1.5 : .4);
        const a = Math.max(0, 1 - c.t/(c.torn ? 1 : 2)); ch.userData.canopy.material.opacity = a; ch.userData.lines.material.opacity = a*.7; if(a <= 0) ch.visible = false; }
      else ch.visible = false;
      if(O.flag.parent){ const cl = O.flag.userData.cloth, pa = cl.geometry.attributes.position, b = O.flag.userData.base;
        for(let i=0;i<pa.count;i++){ const x = b[i*3]; pa.setZ(i, Math.sin(x*3.2 - E.t*4.5)*.12*x + Math.sin(x*7 - E.t*7)*.03*x); } pa.needsUpdate = true; cl.geometry.computeVertexNormals(); }
      if(E.kind==='end-win'){ const a = Math.sin(E.t*.08)*.35; camBase.pos.set(Math.sin(a - .3)*13, 2.4, Math.cos(a - .3)*13); }
    }

    else if(E.kind==='end-fail'){
      const r = O.rocket; r.rotation.set(E.t*.25, E.t*.15, E.t*.35); r.position.set(Math.sin(E.t*.2)*1.2, Math.cos(E.t*.25)*.5, 0); throttle(0);
      rateDo('ss', 6, () => SMK.spawn({ x:r.position.x, y:r.position.y, z:r.position.z, vx:rnd(-.3,.3), vy:rnd(-.3,.3), vz:rnd(-.3,.3), life:3, s:.35, grow:.5, c0:'#8a8a96', a:.35, fadeIn:1 }));
      O.mars.rotation.y += dt*.03; updDust(dt, .8);
    }

    else if(E.kind==='intro'){
      const P = 7, u2 = (E.t % P)/P, e = ease(u2);
      const curve = E.introCurve || (E.introCurve = new T.QuadraticBezierCurve3(V(-6.5,-1,-2), V(0,5.5,-1), V(6.8,1.4,-7)));
      const p = curve.getPoint(e), tg = curve.getTangent(Math.min(.999, e)).normalize();
      const r = O.rocket; r.position.copy(p); r.quaternion.setFromUnitVectors(V(0,1,0), tg);
      const vis = u2 > .03 && u2 < .97; r.visible = vis;
      if(vis){ throttle(1.1); exhaust(70, 4, .2); }
      O.earth.rotation.y += dt*.08; O.mars.rotation.y += dt*.05;
    }

    /* ortak: enkaz, şok dalgası */
    for(const d of O.debris){ if(!d.visible) continue; const u3 = d.userData; u3.life -= dt; if(u3.life <= 0){ d.visible = false; continue; }
      u3.v.y += (u3.g||0)*dt; d.position.addScaledVector(u3.v, dt); d.rotation.x += u3.w.x*dt; d.rotation.y += u3.w.y*dt; d.rotation.z += u3.w.z*dt;
      if(u3.g && d.position.y < .05){ d.position.y = .05; u3.v.multiplyScalar(.4); u3.v.y = Math.abs(u3.v.y)*.3; u3.w.multiplyScalar(.6); } }
    if(O.shock.material.opacity > 0){ O.shock.scale.multiplyScalar(1 + dt*5); O.shock.material.opacity = Math.max(0, O.shock.material.opacity - dt*1.6); O.shock.lookAt(cam.position); }
  }

  /* --- ışık hızı geçişi --- */
  function updWarp(dt){
    E.warpT += dt; const u = clamp(E.warpT/E.warpDur, 0, 1), k = Math.sin(u*Math.PI);
    const d = O.warp.userData, speed = 20 + k*k*260, L = 1 + k*k*16;
    d.seg.forEach((s,i) => { s.z += speed*dt; if(s.z > 6){ s.z -= 226; } d.pos.set([s.x, s.y, s.z - L, s.x, s.y, s.z], i*6); });
    d.geo.attributes.position.needsUpdate = true;
    const r = O.rocket; r.position.set(Math.sin(E.t*2)*.08, -1.0 + Math.sin(E.t*3)*.05, -3.2 - u*2.5); r.rotation.set(-Math.PI/2 + .12, E.t*.5, 0);
    throttle(1.2 + k*.6); exhaust(120, 14, .3);
    bloom.strength = .8 + k*.45;
    camBase.pos.set(0, .35, 7); camBase.tgt.set(0, -.6, -20);
    if(E.warpTxt) E.warpTxt.style.opacity = u < .15 ? u/.15 : u > .82 ? (1-u)/.18 : 1;
    if(u >= 1){ E.warpT = -1; if(E.warpTxt) E.warpTxt.style.opacity = 0; const cb = E.warpCb; E.warpCb = null; cb && cb(); }
  }

  /* =====================================================================
     ÇİZİM DÖNGÜSÜ
     ===================================================================== */
  let host = null, last = 0;
  function resize(){
    if(!host) return;
    const w = host.clientWidth, h = host.clientHeight; if(!w || !h) return;
    R.setSize(w, h, false); composer.setSize(w, h);
    if(composer.setPixelRatio) composer.setPixelRatio(R.getPixelRatio());
    cam.aspect = w/h; cam.updateProjectionMatrix();
    fit = clamp(2.4/(w/h), 1, 2.3);
    const sc = h*R.getPixelRatio()/(2*Math.tan(cam.fov*Math.PI/360)); FX.mat.uniforms.scale.value = SMK.mat.uniforms.scale.value = sc;
  }
  function frame(now){
    requestAnimationFrame(frame);
    const dt = last ? Math.min(.05, (now-last)/1000) : .016; last = now;
    if(!host || host.offsetParent === null || !E.kind) return;
    if(R.domElement.width === 0 || host.clientWidth !== E._w || host.clientHeight !== E._h){ E._w = host.clientWidth; E._h = host.clientHeight; resize(); }
    try{
      update(dt); FX.update(dt); SMK.update(dt);
      const off = V(rnd(-1,1), rnd(-1,1), 0).multiplyScalar(E.shake*.6 + (E.tension ? .015 : 0));
      const drift = V(Math.sin(E.t*.13)*.25, Math.sin(E.t*.17)*.15, 0);
      const wfit = E.warpT >= 0 ? Math.sqrt(fit) : fit;
      cam.position.copy(camBase.tgt).add(camBase.pos.clone().sub(camBase.tgt).multiplyScalar(wfit)).add(drift).add(off);
      cam.lookAt(camBase.tgt);
      root.visible = E.warpT < 0; O.warp.visible = E.warpT >= 0;
      if(E.warpT >= 0 && !O.warp.parent){ scn.add(O.warp); }
      if(E.warpT >= 0){ if(O.rocket.parent !== scn) scn.add(O.rocket); scn.background = C('#000'); }
      composer.render();
      if(E.flashEl) E.flashEl.style.opacity = E.flash.toFixed(3);
    }catch(e){ console.error(e); }
  }
  requestAnimationFrame(frame);
  window.addEventListener('resize', () => resize());

  E.attach = function(el){
    if(!el) return;
    if(host !== el){
      host = el; el.appendChild(R.domElement);
      if(!el.querySelector('.w3flash')){ const f = document.createElement('div'); f.className = 'w3flash'; el.appendChild(f); }
      if(!el.querySelector('.w3warp')){ const w = document.createElement('div'); w.className = 'w3warp'; w.innerHTML = '<div class="k"></div><div class="t"></div>'; el.appendChild(w); }
      E.flashEl = el.querySelector('.w3flash'); E.warpTxt = el.querySelector('.w3warp');
    }
    E._w = 0; resize();
  };
  E.set = function(kind){ E.warpT = -1; if(O.warp.parent) scn.remove(O.warp); if(E.warpTxt) E.warpTxt.style.opacity = 0; setup(kind); };
  E.play = function(outcome){ E.state = outcome; E.st = 0; E.ev = {}; E.tension = 0; if(outcome==='success' && E.grp==='pad' && typeof sndLaunch==='function') sndLaunch(); };
  E.warp = function(kicker, title, cb){
    reset(); root.visible = false; scn.add(O.warp); scn.add(O.rocket); O.rocket.visible = true; scn.background = C('#000'); scn.environment = env('space', SPACE_ENV);
    sun.position.set(-4, 6, 8); sun.intensity = 2.6; hemi.intensity = .3; E.grp = 'warp';
    E.warpT = 0; E.warpDur = 1.7; E.warpCb = () => { scn.remove(O.warp); cb && cb(); };
    if(E.warpTxt){ E.warpTxt.querySelector('.k').textContent = kicker; E.warpTxt.querySelector('.t').textContent = title; }
    if(typeof sndWhoosh==='function') sndWhoosh();
  };
  E.resize = resize;
  return E;
})();
