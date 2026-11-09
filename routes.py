"""Routes over the canonical SLAI local server. No independent HTTP stack."""
from __future__ import annotations

from typing import Any

from . import __version__
from .physics import ModelError, validated, frame, series, convergence, sweep, template, evaluate_actions
from .quantum import spectrum, t_dual, quantum_template
from .presets import library
from .reports import csv_series, json_snapshot, pdf_report, sldc_report
from .interop import export_sgeo, export_sdrw, inspect_native, availability, canonical_sgeo_scene, load_native_sgeo_scene
from .advanced import rns_spectrum, conformal_anomaly, calabi_yau_example, closed_rns_spectrum, free_boson_cft, oscillator_character, brst_consistency, flat_torus_geodesic, quintic_tangent_metric
from .branes import flat_dbi, affine_dbi, brane_trajectory
from .covariant import polyakov_series
from .nambu_goto import nambu_goto_series


def build_router():
    from applications.tools.server import Router, file_response
    from applications.tools.errors import BadRequest
    router = Router()

    def use(fn, *args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except ModelError as exc:
            raise BadRequest(str(exc)) from exc

    @router.route("GET", "/api/status")
    def status(app, req):
        return {"name": "SLAI StringLab", "version": __version__, "model": "flat-space classical free string",
                "quantum": "finite bosonic/RNS spectra and exact CFT test calculations",
                "extended_solvers": ["covariant_polyakov_flat_FRW", "nonlinear_nambu_goto_static_gauge", "D1_scalar_DBI_background_field"],
                "native_renderer": "WebGL2 SGEO snapshot round-trip (when native facade available); live GPU projection otherwise", "formats": {"scientific_json": True,
                "csv": True, "pdf": app.pdf_available, "sgeo": availability()["sgeo"], "sdrw": availability()["sdrw"], "sldc": app.sldc_available},
                "geometry_fidelity": "SGEO/SDRW are coordinate projections, not complete higher-dimensional states.",
                "optional_agents": app.agents.status()}

    @router.route("GET", "/api/templates")
    def presets(app, req):
        return library()

    @router.route("GET", "/api/default")
    def default(app, req):
        return {"classical": template("open"), "quantum": quantum_template()}

    @router.route("POST", "/api/validate")
    def validate(app, req):
        return use(validated, req.json().get("configuration"))

    @router.route("POST", "/api/frame")
    def single(app, req):
        body = req.json()
        return use(frame, body.get("configuration"), body.get("time", 0.))

    @router.route("POST", "/api/series")
    def run(app, req):
        body = req.json()
        return use(series, body.get("configuration"), body.get("frames", 80))

    @router.route("POST", "/api/actions")
    def actions(app, req):
        body = req.json()
        return use(evaluate_actions, body.get("configuration"), time_samples=body.get("samples", 40))

    @router.route("POST", "/api/convergence")
    def conv(app, req):
        body = req.json()
        return use(convergence, body.get("configuration"), body.get("time"))

    @router.route("POST", "/api/sweep")
    def param_sweep(app, req):
        body = req.json()
        return use(sweep, body.get("configuration"), body.get("start", .1),
                   body.get("end", 1.), body.get("steps", 20))

    @router.route("POST", "/api/quantum")
    def quantum(app, req):
        return use(spectrum, req.json())

    @router.route("POST", "/api/tdual")
    def dual(app, req):
        return use(t_dual, req.json())

    @router.route("GET", "/api/experiments")
    def list_experiments(app, req):
        return app.store.list()

    @router.route("GET", "/api/experiments/{id}")
    def load_experiment(app, req):
        return use(app.store.read, req.params["id"])

    @router.route("POST", "/api/experiments")
    def save_experiment(app, req):
        return use(app.store.save, req.json())

    @router.route("DELETE", "/api/experiments/{id}")
    def delete_experiment(app, req):
        use(app.store.delete, req.params["id"])
        return {"deleted": req.params["id"]}

    @router.route("POST", "/api/export/csv")
    def csv_export(app, req):
        return file_response(use(csv_series, req.json().get("configuration")),
                             "stringlab_timeseries.csv", "text/csv; charset=utf-8")

    @router.route("POST", "/api/export/json")
    def json_export(app, req):
        body = req.json()
        return file_response(use(json_snapshot, body.get("configuration"), body.get("time", 0.)),
                             "stringlab_snapshot.json", "application/json")

    @router.route("POST", "/api/export/pdf")
    def pdf_export(app, req):
        if not app.pdf_available:
            raise BadRequest("ReportLab not installed. Install 'reportlab' to export PDF reports.")
        return file_response(use(pdf_report, req.json().get("configuration")),
                             "stringlab_report.pdf", "application/pdf")

    @router.route("POST", "/api/export/sgeo")
    def sgeo_export(app, req):
        body = req.json()
        return file_response(use(export_sgeo, body.get("configuration"), body.get("time", 0.),
                                 worldsheet=bool(body.get("worldsheet", False))),
                             "stringlab_projection.sgeo", "application/octet-stream")

    @router.route("POST", "/api/export/sdrw")
    def sdrw_export(app, req):
        body = req.json()
        return file_response(use(export_sdrw, body.get("configuration"), body.get("time", 0.)),
                             "stringlab_diagram.sdrw", "application/octet-stream")

    @router.route("POST", "/api/import/sgeo")
    def sgeo_import(app, req):
        return use(inspect_native, req.bytes(6 * 1024 * 1024), "sgeo")

    @router.route("POST", "/api/import/sgeo/scene")
    def import_sgeo_view(app, req):
        return use(load_native_sgeo_scene, req.bytes(6 * 1024 * 1024))

    @router.route("POST", "/api/import/sdrw")
    def sdrw_import(app, req):
        return use(inspect_native, req.bytes(6 * 1024 * 1024), "sdrw")


    @router.route("GET", "/api/agents/status")
    def agent_status(app, req):
        return app.agents.status()

    @router.route("POST", "/api/agents/publish")
    def agent_publish(app, req):
        body = req.json()
        return use(app.agents.publish_result, body.get("configuration"), body.get("time",0.), body.get("revision",0))

    @router.route("POST", "/api/agents/run")
    def agent_run(app, req):
        return use(app.agents.run, req.json())

    @router.route("POST", "/api/advanced/rns")
    def rns(app, req):
        return use(rns_spectrum, req.json())

    @router.route("POST", "/api/advanced/cft")
    def cft(app, req):
        return use(conformal_anomaly, req.json())

    @router.route("POST", "/api/advanced/calabi-yau")
    def calabi_yau(app, req):
        return use(calabi_yau_example, req.json())

    @router.route("POST", "/api/advanced/dbrane")
    def dbrane(app, req):
        return use(flat_dbi, req.json())

    @router.route("POST", "/api/advanced/simulate")
    def extended_simulation(app, req):
        body=req.json()
        if not isinstance(body,dict):raise BadRequest('Simulation options must be an object.')
        mode=body.get('model','polyakov')
        if mode=='polyakov':return use(polyakov_series,body)
        if mode in ('nambu_goto','dbi_d1'):return use(nambu_goto_series,{**body,'electric':body.get('electric',0.) if mode=='dbi_d1' else 0.})
        raise BadRequest('Supported extended dynamics: polyakov, nambu_goto, dbi_d1.')

    @router.route("POST", "/api/advanced/rns-closed")
    def rns_closed(app, req):return use(closed_rns_spectrum,req.json())

    @router.route("POST", "/api/advanced/cft-correlator")
    def cft_corr(app, req):return use(free_boson_cft,req.json())

    @router.route("POST", "/api/advanced/cft-character")
    def cft_character(app, req):return use(oscillator_character,req.json())

    @router.route("POST", "/api/advanced/brst")
    def brst(app, req):return use(brst_consistency,req.json())

    @router.route("POST", "/api/advanced/cy-torus")
    def cy_torus(app, req):return use(flat_torus_geodesic,req.json())

    @router.route("POST", "/api/advanced/cy-quintic-metric")
    def cy_quintic(app, req):return use(quintic_tangent_metric,req.json())

    @router.route("POST", "/api/advanced/dbrane-affine")
    def dbi_affine(app, req):return use(affine_dbi,req.json())

    @router.route("POST", "/api/advanced/dbrane-trajectory")
    def dbi_trajectory(app, req):return use(brane_trajectory,req.json())

    @router.route("POST", "/api/sgeo/scene")
    def native_sgeo_scene(app, req):
        body=req.json()
        return use(canonical_sgeo_scene,body.get('configuration'),body.get('time',0.),
                   worldsheet=bool(body.get('worldsheet',False)))

    @router.route("POST", "/api/export/sldc")
    def native_document(app, req):
        if not app.sldc_available:
            raise BadRequest("Native SLDC export requires SLAI's src.utils.sldc module.")
        return file_response(use(sldc_report, req.json().get("configuration")),
                             "stringlab_report.sldc", "application/octet-stream")

    return router
