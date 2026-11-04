#!/usr/bin/env python3
"""Actualiza data/convocatorias.json (lo ejecuta cada día .github/workflows/convocatorias.yml).

- España: revisa la sección II.B del BOE (oposiciones y concursos) de los últimos días con los datos abiertos del BOE y
  se queda con las plazas de Bombero/a de turno libre (oposición o concurso-oposición). Nada de promoción interna ni
  movilidad. Calcula el fin del plazo de instancias.
- Mis convocatorias (data/mis_convocatorias.json): apunta como novedad cualquier anuncio del BOE que las nombre y avisa
  cuando cambia alguna de las páginas oficiales que se vigilan.

Solo usa la biblioteca estándar. Uso: python3 scripts/convocatorias.py [--dias N]
"""
import hashlib, html, json, re, sys, urllib.request
from urllib.parse import urljoin
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "data" / "convocatorias.json"
REVISADOS = RAIZ / "data" / "revisados.json"  # anuncios ya mirados (para no volver a descargarlos)
MIAS = RAIZ / "data" / "mis_convocatorias.json"
UA = {"User-Agent": "Pokeplanificador/1.0 (convocatorias de bombero)", "Accept": "application/json"}
NUM = {"una": 1, "un": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5, "seis": 6, "siete": 7, "ocho": 8, "nueve": 9,
       "diez": 10, "once": 11, "doce": 12, "trece": 13, "catorce": 14, "quince": 15, "dieciséis": 16, "diecisiete": 17,
       "dieciocho": 18, "diecinueve": 19, "veinte": 20, "veintiuna": 21, "veintiuno": 21, "veintidós": 22, "veintitrés": 23, "veinticuatro": 24, "veinticinco": 25, "veintiséis": 26, "veintisiete": 27,
       "veintiocho": 28, "veintinueve": 29,
       "treinta": 30, "cuarenta": 40, "cincuenta": 50, "sesenta": 60, "setenta": 70, "ochenta": 80, "noventa": 90, "cien": 100}
# Festivos nacionales (para contar días hábiles; los autonómicos y locales no se tienen en cuenta: la fecha es aproximada).
FESTIVOS = {"01-01", "01-06", "05-01", "08-15", "10-12", "11-01", "12-06", "12-08", "12-25"}
BOMBERO = re.compile(r"bomber[oa]s?(?:/a)?\b|conductor[a]?[-/ ]bomber|bombero[a]?[-/ ]conductor", re.I)
NO_VALE = re.compile(r"promoci[oó]n interna|movilidad|cabo|sargento|suboficial|oficial|inspector|jef[ea]|intendente|mando|"
                     r"m[eé]dic|enfermer|psic[oó]log|ingenier|arquitect|t[eé]cnic", re.I)


def get(url, binario=False, timeout=30):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        b = r.read()
    return b if binario else b.decode("utf-8", "replace")


def items_2b(fecha):
    """Anuncios de la sección II.B del BOE de un día: [(id, titulo, departamento)]."""
    try:
        d = json.loads(get(f"https://www.boe.es/datosabiertos/api/boe/sumario/{fecha:%Y%m%d}"))
    except Exception:
        return []
    out = []

    def lista(x):
        return x if isinstance(x, list) else [x] if x else []

    for diario in lista(d.get("data", {}).get("sumario", {}).get("diario")):
        for sec in lista(diario.get("seccion")):
            if sec.get("codigo") != "2B":
                continue
            for dep in lista(sec.get("departamento")):
                its = lista(dep.get("item"))
                for ep in lista(dep.get("epigrafe")):
                    its += lista(ep.get("item"))
                for it in its:
                    out.append((it["identificador"], it["titulo"], dep.get("nombre", "")))
    return out


def texto_boe(ident):
    x = get(f"https://www.boe.es/diario_boe/xml.php?id={ident}")
    notas = [html.unescape(re.sub(r"<[^>]+>", "", n)) for n in re.findall(r"<nota[^>]*>(.*?)</nota>", x, re.S)]
    parrafos = [html.unescape(re.sub(r"<[^>]+>", "", p)).strip() for p in re.findall(r"<p[^>]*>(.*?)</p>", x, re.S)]
    pub = re.search(r"<fecha_publicacion>(\d{8})</fecha_publicacion>", x)
    return notas, parrafos, pub.group(1) if pub else None


def fin_plazo(pub, n, tipo):
    d = datetime.strptime(pub, "%Y%m%d").date()
    if tipo.startswith("natural"):
        f = d + timedelta(days=n)
    else:
        f, k = d, 0
        while k < n:
            f += timedelta(days=1)
            if f.weekday() < 5 and f.strftime("%m-%d") not in FESTIVOS:
                k += 1
    return f.isoformat()


def plazas_de(p):
    pal = "|".join(sorted(NUM, key=len, reverse=True))
    m = re.search(r"\b(\d+|(?:" + pal + r")(?:\s+y\s+(?:" + pal + r"))?)\s+plazas?\b", p, re.I)
    if not m:
        return None
    v = m.group(1).lower()
    if v.isdigit():
        return int(v)
    return sum(NUM.get(x, 0) for x in re.split(r"\s+y\s+", v)) or None


def analizar(ident, titulo, dep):
    notas, parrafos, pub = texto_boe(ident)
    todo = " ".join(notas + parrafos)
    if not BOMBERO.search(todo):
        return None
    # Párrafos (o notas) que convocan plazas de bombero válidas: turno libre por oposición o concurso-oposición.
    validas, sistemas, plazas, plazas_notas = [], set(), 0, 0
    for p in parrafos + notas:
        if not BOMBERO.search(p) or not re.search(r"plaza", p, re.I):
            continue
        antes = p[:BOMBERO.search(p).start()]
        if NO_VALE.search(antes) or re.search(r"promoci[oó]n interna|movilidad", p, re.I):
            continue
        if re.search(r"concurso[- ]oposici[oó]n", p, re.I):
            sistemas.add("Concurso-oposición")
        elif re.search(r"oposici[oó]n", p, re.I):
            sistemas.add("Oposición libre")
        elif re.search(r"\bconcurso\b", p, re.I):
            continue  # solo concurso (sin oposición): no
        validas.append(p)
        if p in notas:
            plazas_notas += plazas_de(p) or 0
        else:
            plazas += plazas_de(p) or 0
    plazas = plazas or plazas_notas  # las notas del BOE repiten el texto: no se suman dos veces
    if not validas:
        return None
    org = re.search(r",\s*(?:del|de la|de los|de las)\s+(.+?),\s*(?:referente|por la que|sobre|relativa)", titulo)
    organismo = org.group(1) if org else dep
    prov = re.findall(r"\(([^()]+)\)", organismo) or re.findall(r"\bde\s+((?:[A-ZÁÉÍÓÚÑ][\wáéíóúñü'-]*)(?:\s+(?:de\s+)?[A-ZÁÉÍÓÚÑ][\wáéíóúñü'-]*)*)$", organismo)
    plazo = re.search(r"plazo de presentaci[oó]n de (?:solicitudes|instancias)[^.]*?(\w+)\s+d[ií]as\s+(h[aá]biles|naturales)", todo, re.I)
    fin = None
    plazo_txt = None
    if plazo and pub:
        n = plazo.group(1).lower()
        n = int(n) if n.isdigit() else NUM.get(n)
        if n:
            tipo = "naturales" if plazo.group(2).lower().startswith("n") else "hábiles"
            plazo_txt = f"{n} días {tipo} desde el día siguiente a la publicación en el BOE"
            fin = fin_plazo(pub, n, tipo)
    bases = next((n.split(":", 1)[1].strip() for n in notas if n.lower().startswith("bases")), None)
    return {
        "id": ident, "fecha": f"{pub[:4]}-{pub[4:6]}-{pub[6:]}" if pub else None, "titulo": titulo,
        "organismo": re.sub(r"\s*\([^()]*\)\s*$", "", organismo), "provincia": prov[-1] if prov else None,
        "plazas": plazas or None, "sistema": " / ".join(sorted(sistemas)) or "Oposición",
        "detalle": validas[0][:400], "bases": bases, "plazo": plazo_txt, "fin": fin,
        "url": f"https://www.boe.es/diario_boe/txt.php?id={ident}", "fuente": "BOE", "fase": "plazo",
    }


def boja_item(anio, num, n):
    """Título, fecha, PDF y texto de un anuncio del BOJA (None si no existe)."""
    try:
        pag = get(f"https://www.juntadeandalucia.es/boja/{anio}/{num}/{n}.html", timeout=30)
    except Exception:
        return None
    tit = re.search(r"<title>(.*?)</title>", pag, re.S)
    tit = html.unescape(re.sub(r"\s+", " ", tit.group(1))).strip() if tit else ""
    t = re.sub(r"\s+", " ", html.unescape(re.sub(r"<script.*?</script>|<style.*?</style>|<[^>]+>", " ", pag, flags=re.S)))
    fecha = re.search(r"Bolet[ií]n n[uú]mero \d+ de (\d{2})/(\d{2})/(\d{4})", t)
    pdf = re.search(r'href="(BOJA\d\d-[^"]+\.pdf)"', pag)
    return {"titulo": tit, "texto": t, "fecha": f"{fecha.group(3)}-{fecha.group(2)}-{fecha.group(1)}" if fecha else None,
            "url": f"https://www.juntadeandalucia.es/boja/{anio}/{num}/{n}.html",
            "pdf": f"https://www.juntadeandalucia.es/boja/{anio}/{num}/{pdf.group(1)}" if pdf else None}


def boja_bases(desde, hasta=None):
    """Revisa los boletines del BOJA a partir del número `desde` y devuelve (convocatorias de bases de bombero, último número)."""
    anio = date.today().year
    out, num, ultimo = [], desde, desde - 1
    while True:
        primero = boja_item(anio, num, 1)
        if not primero:
            break
        items = [primero]
        n = 2
        with ThreadPoolExecutor(6) as ex:
            while True:
                lote = list(ex.map(lambda k: boja_item(anio, num, k), range(n, n + 12)))
                items += [x for x in lote if x]
                if any(x is None for x in lote):
                    break
                n += 12
        for i, it in enumerate(items):
            t = it["titulo"]
            if not re.search(r"bases|convocatoria|proceso selectivo", t, re.I):
                continue
            # Solo bases de entidades locales (ayuntamientos, consorcios, diputaciones...), no nombramientos ni listados.
            if not re.search(r"ayuntamiento|consorcio|diputaci[oó]n|mancomunidad|agencia|bomberos|SPEIS", t, re.I):
                continue
            if re.search(r"\bnombra|ofertan vacantes|listado|relaci[oó]n definitiva|adjudica|admitid|tribunal", t, re.I):
                continue
            # O el título habla de bomberos, o es de un servicio de bomberos y el texto convoca plazas de bombero.
            cuerpo = it.get("texto", "")
            if not BOMBERO.search(t) and not (re.search(r"extinci[oó]n de incendios|bomberos|SPEIS|SPEIS", t, re.I) and BOMBERO.search(cuerpo)):
                continue
            if re.search(r"promoci[oó]n interna", t, re.I) and not re.search(r"turno libre|oposici[oó]n libre", t, re.I):
                continue
            mb = BOMBERO.search(t)
            if mb and re.search(r"\b(cabo|sargento|suboficial|oficial|inspector|jef[ea])\b", t[:mb.start()], re.I):
                continue
            org = re.search(r",\s*(?:del|de la|de los)\s+(.+?),\s*(?:de|por|relativo|sobre|referente)", t)
            organismo = org.group(1) if org else "Andalucía"
            sistema = "Concurso-oposición" if re.search(r"concurso[- ]oposici", t, re.I) else "Oposición libre"
            out.append({"id": f"BOJA-{anio}-{num}-{it['url'].rsplit('/', 1)[-1].split('.')[0]}", "fecha": it["fecha"], "titulo": t,
                        "organismo": re.sub(r"\s*\([^()]*\)\s*$", "", organismo), "provincia": "Andalucía",
                        "plazas": plazas_de(t) or plazas_de(next((x for x in re.split(r"(?<=\.) ", cuerpo) if BOMBERO.search(x) and re.search(r"plaza", x, re.I)), "")),
                        "sistema": sistema, "detalle": t[:400], "bases": f"BOJA n.º {num}",
                        "plazo": None, "fin": None, "fase": "bases", "fuente": "BOJA", "url": it["url"], "pdf": it.get("pdf")})
        ultimo = num
        num += 1
        if num - desde > 80 or (hasta and num > hasta):
            break
    return out, ultimo


_BOPSE = {}
def bop_sevilla_dia(f):
    """Anuncios del BOP de Sevilla de un día: [{url, titulo, org}] (vacío si no hay boletín o no se puede leer)."""
    if f in _BOPSE:
        return _BOPSE[f]
    u = f"https://bopsevilla.dipusevilla.es/publica/consulta-de-bops/buscador/BOP-{f:%d-%m-%Y}/"
    out = []
    try:
        pag = get(u, timeout=40)
    except Exception:
        _BOPSE[f] = out
        return out
    prev = 0
    for m in re.finditer(r'<a[^>]+href="([^"]*/buscador-anuncios/anuncio/[^"]*)"[^>]*>(.*?)</a>', pag, re.I | re.S):
        titulo = html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", m.group(2)))).strip()
        # El organismo es el último texto que aparece antes del enlace (desde el anuncio anterior).
        trozos = [html.unescape(x).strip() for x in re.sub(r"<script.*?</script>|<style.*?</style>", " ", pag[prev:m.start()], flags=re.S).split("<")]
        textos = [re.sub(r"^[^>]*>", "", x).strip() for x in trozos]
        textos = [x for x in textos if re.search(r"[A-Za-zÁÉÍÓÚáéíóúñÑ]{3}", x) and len(x) < 120]
        out.append({"url": urljoin(u, html.unescape(m.group(1))), "titulo": titulo, "org": textos[-1] if textos else ""})
        prev = m.end()
    _BOPSE[f] = out
    return out


def radar_sevilla(fechas, previos):
    """Todo lo de bomberos (turno libre) del BOP de Sevilla en esas fechas: bases, listas, tribunal, exámenes..."""
    vistos = {x["url"] for x in previos}
    nuevos = []
    for f in fechas:
        for a in bop_sevilla_dia(f):
            t = a["titulo"] + " " + a["url"].rsplit("/anuncio/", 1)[-1].replace("-", " ")
            if a["url"] in vistos or not re.search(r"bomber|extinci[oó]n de incendios|SPEIS", t, re.I):
                continue
            if re.search(r"promoci[oó]n interna", t, re.I) and not re.search(r"turno libre", t, re.I):
                continue
            tipo = ("Bases" if re.search(r"\bbases\b|convocatoria para la provisi", t, re.I) and not re.search(r"lista|admitid|tribunal", t, re.I)
                    else "Lista" if re.search(r"lista|admitid|excluid|relaci[oó]n", t, re.I)
                    else "Examen" if re.search(r"ejercicio|examen|prueba|fecha|calificaci|nota", t, re.I)
                    else "Tribunal" if re.search(r"tribunal", t, re.I) else "Anuncio")
            nuevos.append({"fecha": f.isoformat(), "org": a["org"], "titulo": a["titulo"] or "Anuncio", "tipo": tipo, "url": a["url"]})
            vistos.add(a["url"])
    return nuevos


def menciona(ident, claves, titulo=""):
    for _ in range(3):
        try:
            notas, parrafos, pub = texto_boe(ident)
            break
        except Exception:
            continue
    else:
        return False
    t = " ".join([titulo] + notas + parrafos)
    if re.search(r"promoci[oó]n interna", t, re.I) and not re.search(r"turno libre|oposici[oó]n libre", t, re.I):
        return False  # solo promoción interna: no es la tuya
    return all(re.search(c, t, re.I) for c in claves)


def main():
    dias = int(sys.argv[sys.argv.index("--dias") + 1]) if "--dias" in sys.argv else 5
    hoy = date.today()
    datos = json.loads(SALIDA.read_text()) if SALIDA.exists() else {}
    espana = {c["id"]: c for c in datos.get("espana", [])}
    revisados = json.loads(REVISADOS.read_text()) if REVISADOS.exists() else datos.get("revisados", {})
    mias = json.loads(MIAS.read_text())
    # BOJA (Andalucía): bases de convocatorias de bombero en cuanto se publican, antes de que se abra el plazo en el BOE.
    boja_desde = datos.get("boja_ultimo", 0) + 1 or 1
    if "--boja-desde" in sys.argv:
        boja_desde = int(sys.argv[sys.argv.index("--boja-desde") + 1])
    try:
        nuevas_boja, boja_ultimo = boja_bases(boja_desde)
    except Exception as e:
        print("BOJA: error", e)
        nuevas_boja, boja_ultimo = [], boja_desde - 1
    for c in nuevas_boja:
        espana.setdefault(c["id"], c)
        print("  + BOJA", c["organismo"], c["plazas"], c["fecha"])
    print(f"BOJA revisado hasta el n.º {boja_ultimo}")

    fechas = [hoy - timedelta(days=i) for i in range(dias)]
    with ThreadPoolExecutor(6) as ex:
        sumarios = list(ex.map(items_2b, fechas))
    nuevos = [(i, t, d) for s in sumarios for (i, t, d) in s if i not in revisados]
    print(f"{len(nuevos)} anuncios nuevos de la sección II.B en {dias} días")

    def revisar(x):
        i, t, d = x
        try:
            return i, analizar(i, t, d)
        except Exception as e:
            return i, "error"

    with ThreadPoolExecutor(6) as ex:
        res = list(ex.map(revisar, nuevos))
    for i, r in res:
        if r == "error":
            continue
        revisados[i] = hoy.isoformat()
        if r:
            espana[i] = r
            print("  +", r["organismo"], r["plazas"], r["sistema"], r["fin"])
    # Mis convocatorias: anuncios del BOE (cualquier sección II.B) que las nombran.
    hechos = {n["url"] for c in mias for n in c.get("novedades", [])}
    for c in mias:
        for claves in c.get("boe", []):
            for fecha, sumario in zip(fechas, sumarios):
                for (i, t, d) in sumario:
                    url = f"https://www.boe.es/diario_boe/txt.php?id={i}"
                    if url in hechos or not re.search(claves[0], t, re.I):
                        continue
                    if menciona(i, claves, t):
                        c.setdefault("novedades", []).append({"fecha": fecha.isoformat(), "texto": f"BOE: {t}", "url": url, "auto": True})
                        hechos.add(url)
        # BOP de Sevilla: anuncios del día cuyo título o bloque nombran el organismo y la plaza (p. ej. listas de
        # admitidos de Alcalá de Guadaíra). Se mira el sumario de cada día y se apunta el enlace directo al anuncio.
        bs = c.get("bop_sevilla")
        if bs:
            for f in fechas:
                for an in bop_sevilla_dia(f):
                    url, titulo = an["url"], an["titulo"]
                    if url in hechos or not re.search(bs["claves"], titulo + " " + url, re.I):
                        continue
                    if re.search(r"promoci[oó]n interna", titulo, re.I):
                        continue
                    if not re.search(bs["org"], titulo + " " + an["org"], re.I):
                        continue
                    c.setdefault("novedades", []).append({"fecha": f.isoformat(), "auto": True, "url": url,
                                                           "texto": f"BOP de Sevilla: {titulo or 'anuncio nuevo'}"})
                    hechos.add(url)

        # Páginas oficiales que se vigilan: aviso si cambian.
        for v in c.get("vigilar", []):
            try:
                pag = get(v["url"], timeout=40)
            except Exception:
                continue
            txt = re.sub(r"<script.*?</script>|<style.*?</style>", " ", pag, flags=re.S)
            # Documentos (PDF) enlazados en la página, con el texto de su enlace: cada uno nuevo es una novedad
            # con el enlace directo (listas de admitidos, tribunal, fechas, notas...).
            docs = {}
            for href, texto in re.findall(r'<a[^>]+href="([^"]+\.pdf[^"]*)"[^>]*>(.*?)</a>', txt, re.I | re.S):
                url = urljoin(v["url"], html.unescape(href))
                t = html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", texto))).strip()
                docs.setdefault(url, t)
            for href in re.findall(r'href="([^"]+\.pdf[^"]*)"', txt, re.I):
                docs.setdefault(urljoin(v["url"], html.unescape(href)), "")
            antes = v.get("pdfs")
            if antes is not None:
                for url, t in docs.items():
                    if url in antes or url in hechos:
                        continue
                    nombre = t if len(t) > 6 and not re.fullmatch(r"(descargar|ver|pdf|aqu[ií])", t, re.I) else \
                        re.sub(r"[_-]+", " ", url.rsplit("/", 1)[-1].rsplit(".", 1)[0])
                    c.setdefault("novedades", []).append({"fecha": hoy.isoformat(), "auto": True, "url": url,
                                                           "texto": f"Nuevo documento en «{v['nombre']}»: {nombre}"})
                    hechos.add(url)
            v["pdfs"] = sorted(docs)
            # Además, aviso si cambia el texto importante de la página (sin contar fechas, contadores o banners).
            lineas = [html.unescape(re.sub(r"\s+", " ", l)).strip() for l in re.sub(r"<[^>]+>", "\n", txt).split("\n")]
            clave = re.compile(r"bomber|admitid|exclu|examen|ejercicio|tribunal|calificaci|nota|listado|convocatoria|IC10|prueba", re.I)
            h = hashlib.sha256("\n".join([l for l in lineas if l and clave.search(l)]).encode()).hexdigest()[:16]
            if v.get("hash") and v["hash"] != h and not any(n.get("fecha") == hoy.isoformat() and n.get("url", "").endswith(".pdf") for n in c.get("novedades", [])):
                c.setdefault("novedades", []).append({"fecha": hoy.isoformat(), "auto": True, "url": v["url"],
                                                       "texto": f"Ha cambiado la página «{v['nombre']}»: revísala, puede haber listas, fechas o notas nuevas."})
            v["hash"] = h
            v["revisada"] = hoy.isoformat()

    # Radar del BOP de Sevilla (toda la provincia). La primera vez mira los últimos 60 días.
    sevilla = datos.get("sevilla", [])
    # Mientras no se haya podido leer nunca, se intentan los últimos 60 días.
    dias_se = fechas if datos.get("sevilla_ok") else [hoy - timedelta(days=i) for i in range(60)]
    if "--sevilla-dias" in sys.argv:
        dias_se = [hoy - timedelta(days=i) for i in range(int(sys.argv[sys.argv.index("--sevilla-dias") + 1]))]
    with ThreadPoolExecutor(6) as ex:
        list(ex.map(bop_sevilla_dia, dias_se))
    nuevos_se = radar_sevilla(dias_se, sevilla)
    for x in nuevos_se:
        print("  + BOP Sevilla", x["fecha"], x["org"], "|", x["titulo"][:90])
    leidos_se = sum(1 for f in dias_se if _BOPSE.get(f))
    print(f"BOP de Sevilla: {leidos_se} boletines leídos de {len(dias_se)} días, {len(nuevos_se)} anuncios de bomberos nuevos")
    sevilla = sorted(sevilla + nuevos_se, key=lambda x: x["fecha"], reverse=True)
    sevilla = [x for x in sevilla if x["fecha"] >= (hoy - timedelta(days=365)).isoformat()]

    # Limpieza: los revisados de más de 15 días ya no hacen falta; las de España, un año.
    limite = (hoy - timedelta(days=15)).isoformat()
    revisados = {k: v for k, v in revisados.items() if v >= limite}
    hace_un_ano = (hoy - timedelta(days=365)).isoformat()
    lista = sorted((c for c in espana.values() if (c["fecha"] or "") >= hace_un_ano), key=lambda c: c["fecha"] or "", reverse=True)
    MIAS.write_text(json.dumps(mias, ensure_ascii=False, indent=1) + "\n")
    SALIDA.write_text(json.dumps({
        "actualizado": datetime.now(timezone.utc).isoformat(timespec="minutes"),
        "fuente": "BOE, sección II.B (datos abiertos)",
        "mias": mias, "espana": lista, "boja_ultimo": boja_ultimo, "sevilla": sevilla,
        "sevilla_ok": bool(datos.get("sevilla_ok") or leidos_se),
    }, ensure_ascii=False, indent=1) + "\n")
    REVISADOS.write_text(json.dumps(revisados, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
