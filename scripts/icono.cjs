// Genera los iconos de la app (cruz de bombero dorada con un check) en icons/: node scripts/icono.cjs
// Icono: cruz de bombero (cruz de San Florián) dorada sobre rojo, con un check en el centro (el planificador).
const {chromium}=require('playwright');const fs=require('fs');
function svg({redondo, margen=0.86}) {
  const brazo = "M -26,-34 L -92,-196 Q 0,-160 0,-160 Q 0,-160 92,-196 L 26,-34 Z";
  const brazoNotch = "M -24,-40 L -96,-200 L 0,-156 L 96,-200 L 24,-40 Z";
  const cruz = [0,90,180,270].map(a=>`<path d="${brazoNotch}" transform="rotate(${a})"/>`).join("");
  const s = margen; // escala del emblema (más pequeño en el maskable)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="fondo" cx="50%" cy="30%" r="80%"><stop offset="0" stop-color="#EF3B3F"/><stop offset=".55" stop-color="#B5121B"/><stop offset="1" stop-color="#5E0911"/></radialGradient>
    <linearGradient id="oro" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF1B8"/><stop offset=".35" stop-color="#FFD24A"/><stop offset=".7" stop-color="#F2AE05"/><stop offset="1" stop-color="#B97B00"/></linearGradient>
    <linearGradient id="oroBorde" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFF7D6"/><stop offset="1" stop-color="#8A5A00"/></linearGradient>
    <radialGradient id="centro" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="#D9222B"/><stop offset="1" stop-color="#7C0A12"/></radialGradient>
    <linearGradient id="brillo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".34"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <filter id="sombra" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#3A0006" flood-opacity=".55"/></filter>
    <filter id="sombraC" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#3A0006" flood-opacity=".5"/></filter>
    <clipPath id="forma"><rect width="512" height="512" rx="${redondo ? 114 : 0}"/></clipPath>
  </defs>
  <g clip-path="url(#forma)">
    <rect width="512" height="512" fill="url(#fondo)"/>
    <!-- rayos suaves detrás del emblema -->
    <g opacity=".10" fill="#FFD24A" transform="translate(256 262)">${Array.from({length:16},(_,i)=>`<path d="M -10,0 L 0,-330 L 10,0 Z" transform="rotate(${i*22.5})"/>`).join("")}</g>
    <g transform="translate(256 256) scale(${s})">
      <g filter="url(#sombra)">
        <g fill="url(#oroBorde)" transform="scale(1.06)">${cruz}</g>
        <g fill="url(#oro)">${cruz}</g>
      </g>
      <!-- líneas en relieve en cada brazo -->
      <g stroke="#FFF6D0" stroke-opacity=".55" stroke-width="3" fill="none">${[0,90,180,270].map(a=>`<path d="M -16,-62 L -66,-178 M 16,-62 L 66,-178" transform="rotate(${a})"/>`).join("")}</g>
      <circle r="86" fill="url(#oroBorde)" filter="url(#sombraC)"/>
      <circle r="78" fill="url(#centro)"/>
      <circle r="78" fill="none" stroke="#FFE38A" stroke-opacity=".6" stroke-width="2"/>
      <path d="M -36,2 L -10,28 L 40,-28" fill="none" stroke="#FFFFFF" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" filter="url(#sombraC)"/>
    </g>
    <!-- reflejo de cristal arriba -->
    <path d="M 0,0 H 512 V 170 Q 256,250 0,170 Z" fill="url(#brillo)"/>
    <rect width="512" height="512" rx="${redondo ? 114 : 0}" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="4"/>
  </g></svg>`;
}
(async()=>{
  const out=process.argv[2] || require('path').join(__dirname, '..', 'icons'); fs.writeFileSync(out+'/icono.svg', svg({redondo:true}));
  const b=await chromium.launch(); const p=await b.newPage({viewport:{width:512,height:512}});
  const foto=async(opts,size,file)=>{ await p.setViewportSize({width:512,height:512});
    await p.setContent(`<html><body style="margin:0;background:transparent">${svg(opts)}</body></html>`);
    await p.screenshot({path:out+'/tmp.png',omitBackground:true,clip:{x:0,y:0,width:512,height:512}});
    require('child_process').execFileSync('python3',['-c',`from PIL import Image;Image.open('${out}/tmp.png').resize((${size},${size}),Image.LANCZOS).save('${out}/${file}',optimize=True)`]); };
  await foto({redondo:true},512,'icon-512.png'); await foto({redondo:true},192,'icon-192.png'); await foto({redondo:true},64,'favicon.png');
  await foto({redondo:false},180,'apple-touch-icon.png'); await foto({redondo:false,margen:0.68},512,'maskable-512.png');
  await b.close(); console.log('ok');
})();
