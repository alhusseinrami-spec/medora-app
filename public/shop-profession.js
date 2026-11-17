/* Medora Care shop: "I am a …" smart sort. Added to the shop page by the server, whatever index.html is uploaded.
   The customer picks their profession (pharmacist, pediatrician, neurologist, …) and the products that
   profession uses most come first; everything else still follows, in the usual order.
   - With no profession chosen the shop is exactly as before (Oxinab products first on the front page).
   - With one chosen, the best matches come first. Among items that match equally well the usual order is
     kept, so Oxinab products still lead each level, and they are still the first of "Other products".
   - The choice is remembered on this phone (medora_prof) and works in English and Arabic.
   Matching reads each product's English name, description and category, so new products sort themselves. */
(function () {
  if (window.__medoraProf) return;
  window.__medoraProf = true;
  /* global P, CATS, draw */
  if (typeof P === "undefined" || typeof CATS === "undefined" || typeof draw !== "function" || !document.getElementById("g")) return;

  var KEY = "medora_prof";
  function ls(v) {
    try {
      if (v === undefined) return localStorage.getItem(KEY) || "";
      if (!v) localStorage.removeItem(KEY); else localStorage.setItem(KEY, v);
    } catch { /* storage blocked: the choice lasts for this visit */ }
    return "";
  }
  var ar = function () { return (document.documentElement.lang || "").slice(0, 2) === "ar"; };

  // Each profession: option in English, option in Arabic, heading in English, heading in Arabic, keywords,
  // and optionally the shop group (1 Diet shop, 2 Laboratory) whose items all count for it.
  // Keywords are comma separated and match at the start of a word ("child" also finds "children").
  // "word:3" counts three times as much as a plain keyword.
  var PROFS = {
    pharmacist: ["a pharmacist", "صيدلي/ة", "pharmacists", "الصيادلة",
      "thermometer:2, blood pressure monitor:3, pulse oximeter:2, self-test:3, self test:3, pregnancy:3, ovulation:3, urinary infection test, " +
      "pill box:3, pill crusher:2, eye drops:3, eyelid:2, contact lens:3, red eyes, ear plugs:2, nasal aspirator:2, lice:2, nit comb, tick, " +
      "hot/cold:2, heating, first aid:2, plasters:2, crepe:2, conforming bandage, elastic bandage, gauze:2, cotton, alcohol:2, disinfectant, " +
      "insulin:2, lancet, gluco, face mask, gloves, inhalation chamber:2, nebulizer:2, nebuliser:2, hydrogel:2, burn, " +
      "knee cap:2, anklet:2, wrist brace:2, wrist splint, tennis elbow, lumbo:2, back rest, abdominal belt, posture, compression stocking:2, " +
      "insole:2, heel cushion, heel cup, arch support, cervical collar:2, pillow, cast cover, covid:2, flu, hiv, gluten, cannabis, urine test strips"],
    gp: ["a general practitioner", "طبيب/ة عام", "general practitioners", "الأطباء العامّين",
      "stethoscope:3, otoscope:3, pen light:2, blood pressure:3, cuff, thermometer:2, oximeter:2, tongue depressor:2, examination:2, exam:2, " +
      "rapid test:2, strep:2, covid:2, flu, crp, hba1c, glucose, urine test strips:2, ecg:2, electrode, syringe:2, needle, gloves:2, gauze, dressing, " +
      "plaster, tape, alcohol, sharps:2, scale:2, suture:2, blade, scissors, forceps, ultrasound gel:2, echo, eco gel, speculum"],
    pediatrician: ["a pediatrician", "طبيب/ة أطفال", "pediatricians", "أطباء الأطفال",
      "child:4, paediatric:4, pediatric:4, baby:4, infant:4, neonatal:4, newborn:4, kids:3, " +
      "inhalation chamber:3, nebulizer:2, nebuliser:2, nasal aspirator:3, thermometer:3, otoscope:3, stethoscope:2, pen light, tongue depressor:2, " +
      "height:2, scale:2, scalp vein:2, lice:2, nit comb, ear plugs, oximeter:2, strep:2, covid:2, flu:2, rsv:2, rotavirus:2, adenovirus, " +
      "feeding tube:2, urine bag, umbilical:2, hot/cold"],
    neuro: ["a neurologist", "طبيب/ة أعصاب", "neurologists", "أطباء الأعصاب",
      "reflex hammer:4, hammer:3, tuning fork:4, monofilament:3, pen light:3, neurological:3, cervical collar:4, philadelphia:4, cervical:3, neck:2, " +
      "traction:2, mémocervical:3, memory pillow:2, lumbo:2, lumbar:2, ls belt:2, ls support:2, back rest:2, " +
      "posture:2, foot drop:4, hand resting splint:4, wrist splint:2, wrist brace:2, thumb spica, tens:4, heating:2, hot/cold:2, " +
      "wheelchair:3, walker:3, walking stick:3, tripod:2, crutches:2, commode:2, air mattress:3, sitting ring, cushion, " +
      "blood pressure:2, stethoscope, ecg, electrode:2, needle, syringe, pill box:2, eye mask"],
    ortho: ["an orthopedic doctor", "طبيب/ة عظام", "orthopedic doctors", "أطباء العظام",
      "orthopedic:3, brace:3, splint:3, immobiliser:3, immobilizer:3, sling:3, clavicle:3, knee:2, ankle:2, wrist:2, elbow:2, shoulder:2, " +
      "cast:3, plaster of paris:4, padding:3, stockinette:3, crepe:2, elastic bandage:2, traction:3, walker boot:3, crutches:3, " +
      "cervical collar:2, philadelphia:2, insole:2, heel:2, arch:2, bunion:2, lumbo:2, lumbar:2, taylor:3, ash brace:3, posture:2, finger:2, thumb:2, " +
      "walking stick, wheelchair, walker"],
    physio: ["a physiotherapist", "معالج/ة فيزيائي", "physiotherapists", "المعالجين الفيزيائيين",
      "tens:4, hot/cold:3, heating:3, traction:3, ultrasound gel:4, echo:3, eco gel:3, kinesio:4, tape:2, knee:2, ankle:2, elbow:2, tennis elbow:3, " +
      "wrist:2, shoulder:2, posture:3, lumbo:2, lumbar:2, back rest:2, cervical:2, pillow:2, cushion:2, insole:2, arch:2, heel:2, " +
      "walker:3, crutches:3, walking stick:3, tripod:2, wheelchair:2, rom:2, hinged:2, support:2, elastic bandage, crepe"],
    nurse: ["a nurse", "ممرض/ة", "nurses", "الممرضين والممرضات",
      "syringe:3, needle:3, cannula:3, iv set:3, iv:2, extension:2, stopcock:2, scalp vein:2, infusion:2, gauze:3, dressing:3, plaster:2, tape:2, " +
      "gloves:3, foley:3, catheter:2, urine bag:3, underpad:3, feeding tube:2, stomach tube:2, suction:2, oxygen:2, nasal cannula:2, " +
      "nebulizer:2, blood pressure:2, thermometer:2, oximeter:2, sharps:3, alcohol:2, disinfectant:2, cotton:2, id bracelet:3, bracelet:2, " +
      "bed:2, commode:2, air mattress:2, wheelchair, pill box:2, glucose, lancet:2, wound:2, bandage:2"],
    surgeon: ["a surgeon", "جرّاح/ة", "surgeons", "الجرّاحين",
      "surgical:3, blade:3, scalpel:3, suture:4, scissors:3, forceps:3, dissecting:3, drape:3, gown:3, head cover:2, shoe cover:2, " +
      "drain:3, redon:3, sterile:2, gloves:2, gauze:3, swab:2, laparotomy:3, dressing:2, film dressing:3, " +
      "post-op:3, corset:2, abdominal:2, hernia:2, stapler:3, cautery:3, foley:2, catheter, tape:2, face mask:2"],
    icu: ["an anesthesiologist / ICU doctor", "طبيب/ة تخدير وعناية فائقة", "anesthesia and ICU teams", "أطباء التخدير والعناية الفائقة",
      "endotracheal:4, tracheal:3, tracheostomy:4, airway:4, guedel:4, laryngeal:4, stylet:4, resuscitator:4, ambu:4, breathing circuit:4, " +
      "hme:3, filter:2, catheter mount:3, oxygen:3, mask:2, nasal cannula:3, suction:3, yankauer:3, nebulizer:2, " +
      "iv:2, cannula:3, extension:3, stopcock:3, transfusion:3, syringe:2, central venous:4, arterial:3, pressure line:3, ecg:3, electrode:2, " +
      "oximeter:3, spo2:3, feeding tube:2, stomach tube:2, foley:2, urine bag:2"],
    emergency: ["an emergency / ambulance team member", "من فريق الطوارئ / الإسعاف", "emergency teams", "فرق الطوارئ والإسعاف",
      "first aid:4, trauma:4, emergency:4, bleeding:4, burn:3, burnshield:3, blanket:2, tourniquet:4, stretcher:4, triangular:3, " +
      "splint:2, cervical collar:3, philadelphia:3, airway:3, resuscitator:4, ambu:4, oxygen:3, oxysprint:3, mask:2, " +
      "nasal cannula:2, suction:2, iv:2, cannula:2, gauze:2, bandage:2, oximeter:2, blood pressure:2, stethoscope:2, gloves:2, sharps, alcohol"],
    gyn: ["a gynecologist / obstetrician", "طبيب/ة نسائي وتوليد", "gynecologists and obstetricians", "أطباء النسائية والتوليد",
      "pregnancy:4, ovulation:4, vaginal:4, speculum:4, obstetric:4, umbilical:4, cord clamp:4, delivery:3, pap:3, cytobrush:3, " +
      "maternity:3, hcg:3, ultrasound gel:4, echo:3, eco gel:3, probe cover:3, underpad:2, urine test:2, urinary infection:2, " +
      "gloves:2, examination:2, exam:2, foley:2, mucus extractor:3, newborn:2, baby, suture:2, gauze"],
    uro: ["a urologist", "طبيب/ة مسالك بولية", "urologists", "أطباء المسالك البولية",
      "foley:4, catheter:3, urine:3, urinary:3, urology:4, nelaton:4, drainage bag:3, condom catheter:4, suprapubic:4, " +
      "irrigation:3, three way:2, 3-way:2, lubricant:3, uritop:3, scrotal:3, gloves"],
    pulmo: ["a pulmonologist / respiratory therapist", "طبيب/ة صدرية / معالج/ة تنفّسي", "lung and respiratory specialists", "أطباء الصدرية والمعالجين التنفّسيين",
      "oxygen:4, oxysprint:3, nebulizer:4, nebuliser:4, inhalation:4, spacer:4, nasal cannula:4, mask:3, venturi:4, " +
      "spirometry:4, spirometer:4, peak flow:4, mouthpiece:3, respiratory:3, oximeter:3, suction:2, airway:2, tracheostomy:3, " +
      "hme:2, humidifier:3, resuscitator:2, chest drainage:2, stethoscope:2, covid:2, flu:2"],
    dentist: ["a dentist", "طبيب/ة أسنان", "dentists", "أطباء الأسنان",
      "dental:4, saliva:4, bib:3, gloves:3, face mask:3, head cover:2, gauze:3, cotton:3, swab:2, suction:3, " +
      "needle:2, syringe:2, blade:2, suture:2, scissors:2, forceps:2, sterilization:3, sterilisation:3, pouch:2, disinfectant:3, alcohol:2, sharps:2"],
    lab: ["a laboratory technician", "فني/ة مختبر", "laboratory technicians", "فنيي المختبرات",
      "rapid test:3, test:2, blood grouping:3, coombs:3, culture:3, agar:3, media:2, reagent:3, stain:3, pipette:3, tips:2, tube:2, vacutainer:3, " +
      "blood collection:3, lancet:2, container:2, urine:2, swab:2, slide:2, gloves:2, sharps:2, alcohol", 2],
    diet: ["a dietitian / nutritionist", "اختصاصي/ة تغذية", "dietitians", "اختصاصيي التغذية",
      "weight:3, diet:3, protein:3, vitamin:3, mineral:2, detox:2, herbal:2, tea, scale:3, height:2, glucose:2, gluten:2, blood pressure", 1],
    hospital: ["buying for a hospital / medical center", "أشتري لمستشفى / مركز طبي", "hospitals and medical centers", "المستشفيات والمراكز الطبية",
      "gloves:4, syringe:4, needle:3, cannula:4, iv set:4, iv:2, extension:3, stopcock:3, scalp vein:2, transfusion:3, infusion:2, " +
      "gauze:3, dressing:3, plaster:2, tape:3, bandage:2, foley:3, catheter:2, urine bag:3, underpad:3, " +
      "endotracheal:3, airway:3, oxygen:3, mask:3, nasal cannula:3, nebulizer:2, suction:3, feeding tube:2, stomach tube:2, drain:2, " +
      "suture:2, blade:2, surgical:2, sterile:2, gown:3, drape:3, head cover:3, shoe cover:3, sharps:4, id bracelet:4, bracelet:2, " +
      "alcohol:3, disinfectant:3, cleaning:3, mop:2, bucket:2, cart:2, trolley:3, bed:3, examination:2, exam:2, stretcher:3, wheelchair:2, " +
      "ecg:2, electrode:2, oximeter:2, blood pressure:2, thermometer:2, stethoscope:2, ultrasound gel:2, eco gel:2, blood collection:2, rapid test:2"],
    beauty: ["buying for a beauty center", "أشتري لمركز تجميل", "beauty centers", "مراكز التجميل",
      "beauty:4, hair:3, skin:3, face:3, facial:3, compression garment:4, compression:2, cotton:4, gauze:3, swab:3, gloves:4, face mask:3, " +
      "head cover:3, shoe cover:2, gown:2, underpad:3, examination roll:4, roll paper:4, bed roll:4, examination bed:3, trolley:3, stool:3, " +
      "folding screen:3, alcohol:4, disinfectant:4, cleaning:2, sharps:3, syringe:3, insulin:3, needle:3, blade:2, ultrasound gel:4, " +
      "eco gel:4, echo:2, hot/cold:3, eye mask:3, eye:2, eyelid:2, plaster:2, tape:2, film dressing:2, hydrogel:2, burn:2, vitamin:2, collagen:3"],
    home: ["caring for someone at home", "أعتني بمريض في المنزل", "home carers", "من يعتني بمريض في المنزل",
      "wheelchair:4, walker:4, walking stick:4, tripod:3, commode:4, mattress:4, bed:2, underpad:4, diaper:4, " +
      "pill box:4, pill crusher:3, blood pressure monitor:4, thermometer:3, oximeter:3, glucose:2, lancet:2, nebulizer:3, oxygen:2, " +
      "urine bag:3, foley:2, gloves:2, gauze:2, dressing:2, alcohol:2, disinfectant:2, cushion:3, sitting ring:3, back rest:2, heating:2, hot/cold:2, " +
      "compression stocking:2, feeding tube:2, bracelet"],
  };
  var ORDER = ["pharmacist", "hospital", "gp", "pediatrician", "neuro", "ortho", "physio", "nurse", "surgeon", "icu", "emergency", "gyn", "uro", "pulmo", "dentist", "lab", "beauty", "diet", "home"];

  var T = {
    iam: ["I am", "أنا"],
    choose: ["choose your profession…", "اختر مهنتك…"],
    clear: ["Show all in the usual order", "عرض الكل بالترتيب المعتاد"],
    most: ["Most used by ", "الأكثر استخداماً لدى "],
    other: ["Other products", "منتجات أخرى"],
    hint: ["Tell us what you do and we show the items you use most first.", "أخبرنا بمهنتك ونعرض لك أولاً المنتجات التي تستخدمها أكثر."],
  };
  var tx = function (k) { return T[k][ar() ? 1 : 0]; };
  var esc = function (s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); };

  // One regular expression per weight; a keyword matches at the start of a word, spaces also match "-".
  var RX = {};
  function rules(key) {
    if (RX[key]) return RX[key];
    var byW = {};
    PROFS[key][4].split(",").forEach(function (tok) {
      var m = tok.trim().toLowerCase().match(/^(.+?)(?::(\d))?$/);
      if (!m) return;
      var e = m[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "[\\s-]+");
      (byW[m[2] || 1] = byW[m[2] || 1] || []).push(e);
    });
    RX[key] = Object.keys(byW).map(function (w) { return [new RegExp("(?:^|[^a-z0-9\u00e0-\u00ff])(?:" + byW[w].join("|") + ")", "g"), +w]; });
    return RX[key];
  }

  var ORIG = P.slice(), POS = new Map(ORIG.map(function (p, i) { return [p, i]; }));
  var SCORE = new Map(), prof = "";
  function scoreAll(key) {
    SCORE = new Map();
    if (!key) return;
    var rs = rules(key), grpAll = PROFS[key][5];
    ORIG.forEach(function (p) {
      var c = CATS[p.ci] || {}, text = (" " + p.n + " " + (p.d || "") + " " + (c.n || "")).toLowerCase(), sc = 0;
      rs.forEach(function (r) { var hits = text.match(r[0]); if (hits) sc += r[1] * Math.min(hits.length, 2); });
      if (grpAll !== undefined && (c.g || 0) === grpAll) sc += 3;
      if (sc > 0) SCORE.set(p, sc);
    });
  }
  // Higher score first; equal scores keep the shop's own order (Oxinab first). The shop draws from P in order.
  function apply() {
    var sorted = ORIG.slice();
    if (prof) sorted.sort(function (a, b) { return (SCORE.get(b) || 0) - (SCORE.get(a) || 0) || POS.get(a) - POS.get(b); });
    for (var i = 0; i < sorted.length; i++) P[i] = sorted[i];
  }

  // After each draw, put a heading above the matches and another above the rest.
  var byCode = {};
  ORIG.forEach(function (p) { byCode[p.id] = p; });
  function mark() {
    var g = document.getElementById("g");
    if (!g) return;
    g.querySelectorAll(".mprof-h").forEach(function (e) { e.remove(); });
    if (!prof) return;
    var first = null, rest = null, n = 0;
    g.querySelectorAll(".pc").forEach(function (el) {
      var rf = el.querySelector(".rf"), p = rf && byCode[rf.textContent.trim()];
      if (p && SCORE.get(p)) { n++; if (!first) first = el; } else if (!rest && first) rest = el;
    });
    if (!first) return;
    var head = function (txt) { var h = document.createElement("p"); h.className = "mprof-h"; h.textContent = txt; return h; };
    first.before(head(tx("most") + PROFS[prof][ar() ? 3 : 2] + " (" + n + ")"));
    if (rest) rest.before(head(tx("other")));
  }

  var css = document.createElement("style");
  css.textContent = ".mprof{display:flex;align-items:center;gap:8px 10px;flex-wrap:wrap;margin:2px 0 12px;padding:10px 12px;background:var(--soft,#e4f3f5);border-radius:14px}" +
    ".mprof label{font-weight:600}.mprof select{font:inherit;font-weight:600;color:var(--tx,#12363b);background:var(--card,#fff);border:1.5px solid var(--pr,#1b9aaa);border-radius:10px;padding:7px 10px;min-width:0;flex:1 1 220px;max-width:420px}" +
    ".mprof small{flex-basis:100%;color:var(--mu,#5d7b80);font-size:12.5px}" +
    ".mprof-h{grid-column:1/-1;margin:6px 0 -4px;font-weight:700;font-size:15px;color:var(--prd,#0f5f66)}";
  document.head.appendChild(css);

  var box = document.createElement("div");
  box.className = "mprof";
  box.id = "mprof";
  function render() {
    var i = ar() ? 1 : 0;
    var opts = '<option value="">' + esc(tx("choose")) + "</option>" + ORDER.map(function (k) {
      return '<option value="' + k + '"' + (k === prof ? " selected" : "") + ">" + esc(PROFS[k][i]) + "</option>";
    }).join("") + (prof ? '<option value="">' + esc(tx("clear")) + "</option>" : "");
    box.innerHTML = '<label for="mprof-s">' + esc(tx("iam")) + '</label><select id="mprof-s">' + opts + "</select>" +
      (prof ? "" : "<small>" + esc(tx("hint")) + "</small>");
    box.querySelector("select").onchange = function (e) { set(e.target.value); };
  }
  function set(key, quiet) {
    prof = Object.prototype.hasOwnProperty.call(PROFS, key) ? key : "";
    if (!quiet) ls(prof);
    scoreAll(prof);
    apply();
    render();
    // A lab technician or dietitian picking it now goes to the Laboratory or Diet shop tab, when the shop has one.
    var g = prof && PROFS[prof][5];
    try {
      /* global setGroup */
      if (!quiet && g && typeof setGroup === "function" && ORIG.some(function (p) { return ((CATS[p.ci] || {}).g || 0) === g; })) setGroup(g);
      else draw();
    } catch { /* not this shop version */ }
  }

  (document.getElementById("tabs") || document.getElementById("g")).before(box);
  var orig = draw;
  window.draw = function () { var r = orig.apply(this, arguments); try { mark(); } catch { /* keep the shop working */ } return r; };
  set(ls(), true);

  // Re-label when the shop's language button is pressed (it rewrites the page's text first).
  new MutationObserver(function () { render(); mark(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
})();
