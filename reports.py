"""Self-contained, reproducibility-aware PDF reports and numeric CSV exports."""
from __future__ import annotations

import csv
import io
import json
from pathlib import Path

from .physics import validated, frame, series


def csv_series(config: dict, count: int = 80) -> bytes:
    out = io.StringIO(newline="")
    wr = csv.writer(out)
    wr.writerow(["time_tau", "energy_gauge_fixed", "closed_global_residual", "status", "solver"])
    for row in series(config, count):
        d = row["diagnostics"]
        wr.writerow([row["time"], d.get("energy"), d.get("level_matching_residual"),
                     row["status"], row["solver"]])
    return out.getvalue().encode("utf-8")


def json_snapshot(config: dict, time: float = 0) -> bytes:
    c = validated(config)
    obj = {"format": "StringLab snapshot JSON (NOT SGEO)", "schema": 1,
           "configuration": c, "frame": frame(c, time), "references": ["Tong 2009 sections 1.2-1.4",
           "Wray 2011 chapters 2-3"]}
    return json.dumps(obj, allow_nan=False, indent=2).encode("utf-8")


def pdf_report(raw: dict, title: str = "SLAI StringLab - Experiment Report") -> bytes:
    """A structured multi-page PDF with a computed curve figure and testable diagnostics."""
    from hashlib import sha256
    from html import escape
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.graphics.shapes import Drawing, Line, PolyLine, Rect, String
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    # Register the system's installed Unicode font (not redistributed in StringLab).
    # The default PDF base-14 fonts cannot reliably render Δ and superscripts.
    for font_path in (r"C:\Windows\Fonts\arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                      "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"):
        try:
            if Path(font_path).is_file():
                pdfmetrics.registerFont(TTFont("StringLabMath", font_path))
                break
        except Exception:
            pass
    math_font = "StringLabMath" if "StringLabMath" in pdfmetrics.getRegisteredFontNames() else "Helvetica"
    from .physics import evaluate_actions

    c = validated(raw)
    snapshot = frame(c, 0.)
    on_shell = evaluate_actions(c, time_samples=32)
    digest = sha256(json.dumps(c, sort_keys=True, ensure_ascii=False, allow_nan=False).encode()).hexdigest()
    pdf = io.BytesIO()
    doc = SimpleDocTemplate(pdf, pagesize=A4, topMargin=47, bottomMargin=48,
                            leftMargin=45, rightMargin=45,
                            title=title, author="SLAI StringLab", subject="Reduced string physics and reproducibility")
    style = getSampleStyleSheet()
    style.add(ParagraphStyle(name="SLMeta", parent=style["BodyText"], fontSize=8.5, leading=12,
                             textColor=colors.HexColor("#43566b"), spaceAfter=6))
    style.add(ParagraphStyle(name="SLSection", parent=style["Heading2"], fontSize=12,
                             textColor=colors.HexColor("#164d6c"), spaceBefore=12, spaceAfter=7))
    style.add(ParagraphStyle(name="SLTiny", parent=style["BodyText"], fontSize=8, leading=11))
    style.add(ParagraphStyle(name="SLTitle", parent=style["Title"], fontSize=21,
                             textColor=colors.HexColor("#15364c"), alignment=TA_CENTER, spaceAfter=6))
    style.add(ParagraphStyle(name="SLFormula", parent=style["BodyText"], fontName=math_font,
                             fontSize=12.2, leading=18, spaceBefore=8, spaceAfter=12,
                             textColor=colors.HexColor("#193d53")))
    # All report paragraphs, including table cells, need Unicode support for X⁻ and ∂τ.
    for name in ("Normal", "BodyText", "Title", "Heading2", "SLMeta", "SLSection", "SLTiny", "SLTitle", "SLFormula"):
        style[name].fontName = math_font
    def P(x,sty="BodyText"):
        return Paragraph(escape(str(x)),style[sty])
    def table(rows, widths):
        t=Table([[P(a,"SLTiny") for a in row] for row in rows],colWidths=widths,repeatRows=1,hAlign="LEFT")
        t.setStyle(TableStyle([
            ("VALIGN",(0,0),(-1,-1),"TOP"),
            ("BACKGROUND",(0,0),(-1,0),colors.HexColor("#e6f2f7")),
            ("LINEBELOW",(0,0),(-1,0),.6,colors.HexColor("#8cb4c9")),
            ("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white,colors.HexColor("#f7fafd")]),
            ("BOTTOMPADDING",(0,0),(-1,-1),6),
            ("TOPPADDING",(0,0),(-1,-1),6),
        ]))
        return t
    story = [P(title,"SLTitle"),
             P("SCIENTIFIC COMPUTATION | CLASSICAL FREE BOSONIC STRING | LIGHT-CONE GAUGE", "SLMeta"),
             Spacer(1,8), P("Status: mathematically defined restricted model; no experimental claim.","SLMeta"),
             P("1. Objective and model classification", "SLSection"),
             P("Reproduce time-dependent open/closed transverse bosonic-string modes, "
               "inspect the globally admissible classical field and compare sampled on-shell action densities. "
               "The governing equations are specialized to flat Minkowski spacetime and light-cone gauge."),
             P("2. Governing mathematics", "SLSection"),
             P("In flat Minkowski spacetime, the squared separation between two events is given by the following light-cone metric. The dynamical equations use differential derivatives. The equations are mathematical expressions, not literal programming syntax."),
             Paragraph("Δs² = −2 ΔX⁺ ΔX⁻ + Σᵢ (ΔYⁱ)²", style["SLFormula"]),
             Paragraph("∂²Yⁱ/∂τ² − ∂²Yⁱ/∂σ² = 0", style["SLFormula"]),
             Paragraph("X⁺ = p⁺τ;   T = 1/(2πα′)", style["SLFormula"]),
             P("The Virasoro constraints reconstruct the derivatives of X⁻. Closed strings must also satisfy the global integral of (∂τY · ∂σY) over σ = 0."),
             P("3. Reproducible configuration", "SLSection")]
    crows=[["Parameter","Value"],
           ["String model",f"{c['kind']} | {c['bc']} boundary conditions"],
           ["Background / gauge", "Flat Minkowski | light-cone | natural units (hbar=c=1)"],
           ["Target space", f"D={c['dimensions']} | transverse coordinates={c['dimensions']-2}"],
           ["Regge slope / tension",f"alpha_prime={c['alpha_prime']:.8g} | T={1/(2*3.141592653589793*c['alpha_prime']):.8g}"],
           ["Gauge-rate",f"p_plus={c['p_plus']:.8g}"],
           ["Boundary anchors", f"start X1={c['anchor_start'][0]:.6g}; end X1={c['anchor_end'][0]:.6g}"],
           ["Evolution", f"{c['solver']} | dt={c['dt']} | duration={c['duration']}"],
           ["Sampling",f"{c['points']} positions | {len(c['modes'])} configured modes"],
           ["3-axis view",", ".join(c['projection'])],
           ["Projection classification",snapshot["projection_kind"].replace("_"," ")]]
    story += [table(crows,[180,320]),P("4. Selected Fourier modes", "SLSection")]
    mode_rows=[["n / axis","Amplitude(s)","Phase(s)","Active"]]
    for m in c["modes"]:
        if c["kind"]=="open":
            a=f"A={m['amplitude']:.6g}"; phase=f"phi={m['phase']:.6g}"
        else:
            a=f"L={m['left']:.6g}; R={m['right']:.6g}"
            phase=f"L={m['phase_left']:.6g}; R={m['phase_right']:.6g}"
        mode_rows.append([f"{m['n']} / X{m['axis']}", a, phase,"Yes" if m["enabled"] else "No"])
    if len(mode_rows)==1:mode_rows.append(["None","--","--","--"])
    story += [table(mode_rows,[84,140,195,81]),P("5. Calculated profile at tau = 0", "SLSection")]
    # PDF figures are derived solely from computed 3-axis projection values.
    positions = snapshot['geometry']
    x0=min(p[0] for p in positions); x1=max(p[0] for p in positions)
    y0=min(p[1] for p in positions); y1=max(p[1] for p in positions)
    spanx=max(1e-9,x1-x0); spany=max(1e-9,y1-y0)
    w,h=495.,165.; mx,my=27.,22.
    scale=min((w-2*mx)/spanx,(h-2*my)/spany)
    xc=(x0+x1)*.5;yc=(y0+y1)*.5
    projection=lambda pt:(w*.5+(pt[0]-xc)*scale,h*.5+(pt[1]-yc)*scale)
    d=Drawing(w,h)
    d.add(Rect(1,1,w-2,h-2,strokeColor=colors.HexColor("#c9dbe5"),fillColor=colors.HexColor("#f6faff"),strokeWidth=.8))
    for pos in range(1,6):
        vx=pos*w/6;vy=pos*h/6
        d.add(Line(vx,11,vx,h-11,strokeColor=colors.HexColor("#dce9f0"),strokeWidth=.45))
        d.add(Line(11,vy,w-11,vy,strokeColor=colors.HexColor("#dce9f0"),strokeWidth=.45))
    flat=[]
    for point in positions:
        xx,yy=projection(point);flat.extend([xx,yy])
    if snapshot['closed'] and len(flat)>=4:flat+=flat[:2]
    if len(flat)>=4:d.add(PolyLine(flat,strokeColor=colors.HexColor("#157caf"),strokeWidth=2,fillColor=None))
    d.add(String(12,5,f"Horizontal: {c['projection'][0]} | vertical: {c['projection'][1]} | projected state, not full spacetime",fontSize=7,fillColor=colors.HexColor("#566779")))
    story += [d,P("The figure plots only the first two selected display coordinates. A sigma axis is a worldsheet "
                  "parameter, not a target-space spatial coordinate; unshown dimensions are omitted.","SLMeta"),
              P("6. Computed diagnostics", "SLSection")]
    diag=snapshot['diagnostics']
    selected=[("Transverse gauge-fixed Hamiltonian",diag['energy']),
              ("Normalized closed global closure residual",diag['level_matching_residual']),
              ("Boundary / local gauge status",f"{diag['boundary_status']} / {diag['constraint_status']}"),
              ("NG action integrand integrated over sigma",diag['ng_on_shell_density_integral_sigma']),
              ("Polyakov conformal integrand over sigma",diag['polyakov_on_shell_density_integral_sigma']),
              ("On-shell action-integrand discrepancy",diag['on_shell_action_density_difference']),
              ("NG worldsheet action over configured duration",on_shell['nambu_goto_on_shell']),
              ("Polyakov action over configured duration",on_shell['polyakov_conformal_gauge_on_shell']),
              ("Quadrature relative disagreement",on_shell['relative_difference']),
              ("Degenerate metric samples (max per frame)",on_shell['possible_degenerate_metric_samples_per_frame'])]
    story += [table([["Observable","Value"]]+[[k,f"{v:.9g}" if isinstance(v,(int,float)) else str(v)] for k,v in selected],[305,195]),
              P("7. Limitations and interpretation", "SLSection"),
              P("On-shell action values compare two equivalent classical descriptions evaluated on the "
                "same restricted reconstructed field. This is not an independent numerical solution of the "
                "nonlinear Nambu-Goto equations. A degenerate induced metric may make the Nambu-Goto "
                "variational description singular. Calculated values have sampling/quadrature error. "
                "Global closure must be satisfied for a closed-string solution; a visually closed "
                "polyline cannot enforce it. Neither the figure nor these calculations prove string theory."),
              P("8. Reproducibility and references", "SLSection"),
              P("Model data SHA-256: "+digest,"SLTiny"),
              P("Implementation schema 1. Preserve the source StringLab experiment JSON for all parameters, "
                "mode coefficients, units and solver settings. SGEO/SDRW exports preserve projected geometry only.","SLTiny"),
              Spacer(1,6),
              P("[1] D. Tong (2009), String Theory, Cambridge Part III, sec. 1.2-1.4, Eqs. 1.13, 1.22, 1.31-1.38.","SLTiny"),
              P("[2] K. Wray (2011), An Introduction to String Theory, ch. 2-3, revised 6 May 2011.","SLTiny")]
    def footer(cvs,document):
        cvs.saveState();cvs.setFont("Helvetica",8);cvs.setFillColor(colors.HexColor("#60788b"))
        cvs.drawString(45,26,"SLAI StringLab | Mathematical model, not experimental evidence")
        cvs.drawRightString(A4[0]-45,26,f"Page {document.page}")
        cvs.restoreState()
    doc.build(story,onFirstPage=footer,onLaterPages=footer)
    return pdf.getvalue()


def sldc_report(raw: dict, title: str = "SLAI StringLab — Experiment Report") -> bytes:
    """Author a real editable SLDC 1.x package with native equation blocks.

    Uses only the canonical `src.utils.sldc` library. No imitation ZIP
    schemas, PDF embedding or rasterized mathematical expressions.
    """
    from hashlib import sha256
    try:
        from src.utils import sldc
    except ImportError as exc:
        raise ImportError("Native SLDC requires SLAI src.utils.sldc in the active checkout") from exc
    from .physics import evaluate_actions
    c = validated(raw)
    f = frame(c, 0.)
    actions = evaluate_actions(c, time_samples=24)
    digest = sha256(json.dumps(c, sort_keys=True, ensure_ascii=False, allow_nan=False).encode()).hexdigest()
    b = sldc.make_block
    blocks = [
        b("heading", title, attributes={"level": 1}),
        b("paragraph", "Scientific classification: restricted flat Minkowski free classical bosonic string; no experimental claim."),
        b("heading", "1. Governing equations", attributes={"level": 2}),
        b("paragraph", "The metric in light-cone coordinates is defined using squared finite displacements in flat Minkowski space. The worldsheet dynamics uses the corresponding derivatives."),
        sldc.make_equation(r"\Delta s^{2}=-2\,\Delta X^{+}\Delta X^{-}+\sum_{i}(\Delta Y^{i})^{2}"),
        sldc.make_equation(r"\partial_{\tau}^{2}Y^{i}-\partial_{\sigma}^{2}Y^{i}=0"),
        sldc.make_equation(r"T=\frac{1}{2\pi\alpha'}\,,\qquad X^{+}=p^{+}\tau"),
        sldc.make_equation(r"\partial_{\sigma}X^{-}=\frac{\partial_{\tau}Y\cdot\partial_{\sigma}Y}{p^{+}}"),
        b("heading", "2. Reproducible configuration", attributes={"level": 2}),
        sldc.make_table([["Parameter", "Value"],
          ["String / boundaries", f"{c['kind']} / {c['bc']}"],
          ["Dimensions / gauge", f"D={c['dimensions']} / light-cone"],
          ["Regge slope", str(c['alpha_prime'])],
          ["Spatial samples", str(c['points'])],
          ["Solver / dt / duration", f"{c['solver']} / {c['dt']} / {c['duration']}"],
          ["Displayed axes", ", ".join(c['projection'])],
          ["Configuration SHA-256", digest]], header_rows=1, caption="Validated classical input"),
        b("heading", "3. Simulation diagnostics", attributes={"level": 2}),
        sldc.make_table([["Observable", "Value"]]+[[str(key), str(value)] for key,value in sorted(f['diagnostics'].items()) if isinstance(value,(str,int,float))],header_rows=1),
        b("heading", "4. On-shell action comparison", attributes={"level": 2}),
        sldc.make_table([["Quantity", "Calculated value"]]+[[str(key),str(value)] for key,value in sorted(actions.items()) if isinstance(value,(str,int,float))],header_rows=1),
        b("paragraph", "These are on-shell quantities derived from the restricted light-cone solution, not independent general covariant Polyakov and Nambu–Goto PDE solutions."),
        b("heading", "5. Limitations and references", attributes={"level": 2}),
        b("paragraph", "Projected geometry omits higher-dimensional coordinates. See saved native StringLab experiment for the full configuration and its mode coefficients. Quantization, interactions and curved backgrounds are outside this classical report."),
        b("paragraph", "D. Tong (2009), String Theory, Part III Cambridge; K. Wray (2011), An Introduction to String Theory, chapters 2–3. The mathematical and modeling conventions are described in StringLab docs/SCIENCE.md."),
    ]
    pkg = sldc.new_package(title, blocks)
    # new_package defaults to 1.0.0, but native equation blocks require the
    # explicit SLDC 1.1.0 scientific-feature opt-in. Canonical serialization
    # rejects 1.0 packages that declare the scientific feature.
    pkg.version = "1.1.0"
    sldc.validate_package(pkg)
    return sldc.dumps_package(pkg)
