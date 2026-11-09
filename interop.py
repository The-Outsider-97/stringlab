"""SGEO/SDRW public-facade interoperability.

Imports the canonical SLAI v2.4 implementations when present; never invents
file signatures or third-party container schemas. Exports are explicitly
*coordinate projections*, not complete D-dimensional physical configurations.
The experiment JSON remains the reproducibility source of truth.
"""
from __future__ import annotations

from hashlib import sha256
from json import dumps
from math import sqrt
from typing import Any

from .physics import ModelError, frame, series, validated


def _sgeo():
    try:
        from src.utils.sgeo import SGEODocument
        return SGEODocument
    except ImportError as exc:
        raise ModelError("SLAI native SGEO adapter is unavailable (src.utils.sgeo). Install into the SLAI v2.4 checkout.") from exc


def _sdrw():
    try:
        from src.utils.sdrw import SDRWDocument
        return SDRWDocument
    except ImportError as exc:
        raise ModelError("SLAI native SDRW adapter is unavailable (src.utils.sdrw). Install into the SLAI v2.4 checkout.") from exc


def availability() -> dict[str, bool]:
    out = {}
    for kind, factory in (("sgeo", _sgeo), ("sdrw", _sdrw)):
        try:
            factory()
            out[kind] = True
        except ModelError:
            out[kind] = False
    return out


def _dist(a: list[float], b: list[float]) -> float:
    return sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def _digest(c: dict) -> str:
    return sha256(dumps(c, ensure_ascii=False, sort_keys=True, allow_nan=False).encode()).hexdigest()


def export_sgeo(raw: dict, tau: float = 0., *, worldsheet: bool = False) -> bytes:
    """SGEO curve segments and optional tessellated projected worldsheet.

    Coordinates in the document are a 3-axis projection; no dimensions are
    silently discarded, because the omission and axis map are in native metadata.
    """
    c = validated(raw)
    SGEODocument = _sgeo()
    doc = SGEODocument.new("StringLab projected geometry", unit="m")
    head = doc.add_group("Computed string projection")
    doc.attach_semantics(head, {"source": "SLAI StringLab", "theory": c["theory"],
                  "coordinate_axes": c["projection"], "model_digest_sha256": _digest(c),
                  "model_dimensions": c["dimensions"], "gauge": "light-cone, flat background",
                  "physical_units_warning": "Interop convention: 1 model length = 1 metre; not an experimental calibration",
                  "projection_warning": "3D projection only, see saved StringLab experiment for full model"},
                  namespace="stringlab")
    f = frame(c, tau)
    points = f["geometry"]
    count = 0
    for i in range(len(points) if c["kind"] == "closed" else len(points) - 1):
        a, b = points[i], points[(i + 1) % len(points)]
        if _dist(a, b) <= 1e-10:
            continue
        doc.add_segment(a, b, parent=head, name=f"String edge {i:04}")
        count += 1
    if count == 0:
        doc.add_point(points[0], parent=head, name="Collapsed string point")
    if worldsheet:
        # Generate a triangular *display projection* from genuine sampled
        # trajectory states; no equivalence with the Lorentzian target worldsheet
        # metric is implied by a rendered Euclidean triangle mesh.
        steps = 20
        cc = dict(c)
        cc["points"] = min(128, c["points"])
        sampled = series({**cc, "solver": "analytical"}, steps)
        longitudinal = len(sampled[0]["geometry"])
        vertices = [v for x in sampled for v in x["geometry"]]
        faces = []
        for j in range(steps - 1):
            for i in range(longitudinal if c["kind"] == "closed" else longitudinal - 1):
                nxt = (i + 1) % longitudinal
                a = j * longitudinal + i
                b = j * longitudinal + nxt
                d = (j + 1) * longitudinal + i
                f = (j + 1) * longitudinal + nxt
                for v1, v2, v3 in ((a,b,f),(a,f,d)):
                    p, q, r = vertices[v1], vertices[v2], vertices[v3]
                    u = [q[k]-p[k] for k in range(3)]
                    v = [r[k]-p[k] for k in range(3)]
                    cross = [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
                    if sum(z*z for z in cross) > 1e-18:
                        faces.append([v1,v2,v3])
        if faces:
            oid = doc.add_mesh(vertices, faces, name="Projected worldsheet (display only)")
            doc.attach_semantics(oid, {"role": "parameter-time surface",
                      "meaning": "2D swept parameter mesh projected into three display axes; not a 4D timelike embedding"},
                      namespace="stringlab")
    doc.validate(mode="strict", raise_on_error=True)
    result = doc.dumps()
    SGEODocument.from_bytes(result, mode="read").validate(raise_on_error=True)
    return result


def export_sdrw(raw: dict, tau: float = 0.) -> bytes:
    """Native 2D polyline diagram using first two configured display axes."""
    c = validated(raw)
    SDRWDocument = _sdrw()
    doc = SDRWDocument.new("StringLab coordinate diagram", unit="m")
    doc.add_layer("Calculated profile")
    f = frame(c, tau)
    xy = [[v[0], v[1]] for v in f["geometry"]]
    cleaned = [xy[0]]
    for x in xy[1:]:
        if _dist(cleaned[-1], x) > 1e-10:
            cleaned.append(x)
    if c["kind"] == "closed" and len(cleaned) > 2 and _dist(cleaned[-1], cleaned[0]) < 1e-10:
        cleaned.pop()
    if len(cleaned) >= (3 if c["kind"] == "closed" else 2):
        obj = doc.add_polyline(cleaned, closed=c["kind"] == "closed", layer="Calculated profile")
    elif len(cleaned) >= 2:
        obj = doc.add_line(cleaned[0], cleaned[-1], layer="Calculated profile")
    else:
        obj = doc.add_point(cleaned[0], layer="Calculated profile")
    doc.attach_semantics(obj, {"source": "SLAI StringLab", "coordinate_axes": c["projection"][:2],
                  "model_digest_sha256": _digest(c), "projection_warning": "2D projection or parameter diagram",
                  "physical_units_warning": "1 model length = 1 metre for interchange, not experimental calibration"},
                  namespace="stringlab")
    doc.validate(mode="strict", raise_on_error=True)
    result = doc.dumps()
    SDRWDocument.from_bytes(result, mode="read").validate(raise_on_error=True)
    return result


def inspect_native(content: bytes, kind: str) -> dict[str, Any]:
    """Inspect an imported native package; do not silently turn it into a physical initial state."""
    if not isinstance(content, bytes) or not 16 <= len(content) <= 6 * 1024 * 1024:
        raise ModelError("Native file must be between 16 B and 6 MB.")
    if kind not in ("sgeo", "sdrw"):
        raise ModelError("Only .sgeo and .sdrw native packages may be imported here.")
    Type = _sgeo() if kind == "sgeo" else _sdrw()
    try:
        doc = Type.from_bytes(content, mode="read")
        doc.validate(mode="strict", raise_on_error=True)
        details = doc.inspect()
    except Exception as exc:
        raise ModelError(f"Invalid {kind.upper()} package: {exc}") from exc
    return {"format": kind, "inspection": details, "digest_sha256": sha256(content).hexdigest(),
            "import_mode": "read_only_reference",
            "note": "Imported geometry is a reference. It has not been converted into boundary-compatible string initial data."}


def _native_scene_from_bytes(content: bytes, *, source: str, requested_time: float | None = None) -> dict[str, Any]:
    """Read native geometry from the canonical SGEO document object model."""
    Type=_sgeo()
    try:
        doc=Type.from_bytes(content,mode='read')
        doc.validate(mode='strict',raise_on_error=True)
        segments=[]
        for offset in range(0,4096,100):
            identifiers=doc.query_ids(type_name='segment',limit=100,offset=offset)
            for oid in identifiers:
                geo=doc.get(oid).get('geometry',{})
                if geo.get('kind')!='segment':
                    raise ModelError('Native scene contains an unexpected segment shape.')
                segments.append({'id':oid,'start':geo['start'],'end':geo['end']})
            if len(identifiers)<100:break
        else:raise ModelError('SGEO segment budget exceeded (maximum 4096).')
        mesh=None
        mesh_ids=doc.query_ids(type_name='mesh',limit=1)
        # Also accept native analytic primitives, not only mesh objects.
        surface_kinds=('box','cylinder','sphere','extrusion','revolution','brep','nurbs_surface')
        if mesh_ids or any(doc.query_ids(type_name=k,limit=1) for k in surface_kinds):
            raw=doc.to_mesh()
            mesh={'vertices':raw.get('vertices',[]),'faces':raw.get('faces',[])}
            if len(mesh['vertices'])>20000 or len(mesh['faces'])>35000:
                raise ModelError('Native SGEO surface exceeds the viewer safety budget.')
        if not segments and mesh is None:
            raise ModelError('SGEO contains no supported 3D segment or tessellatable surface geometry.')
    except ModelError:raise
    except Exception as exc:
        raise ModelError(f'Canonical SGEO scene could not be decoded: {exc}') from exc
    return {'format':'slai.sgeo','source':source,
            'valid_native_document':True,'digest_sha256':sha256(content).hexdigest(),
            'time':float(requested_time) if requested_time is not None else None,
            'segments':segments,'mesh':mesh,'units':doc.inspect().get('unit','m') if isinstance(doc.inspect(),dict) else 'm',
            'geometry_scope':'canonical SGEO native scene geometry, not a reconstructed string state',
            'renderer_hint':'WebGL2; coordinate-frame transform and material fidelity are limited to the canonical to_mesh world transform'}


def load_native_sgeo_scene(content: bytes) -> dict[str, Any]:
    """Validate and display an arbitrary SGEO scene; do not treat it as initial string data."""
    if not isinstance(content,bytes) or not 16<=len(content)<=6*1024*1024:
        raise ModelError('SGEO import must be between 16 bytes and 6 MB.')
    return _native_scene_from_bytes(content,source='canonical_import')


def canonical_sgeo_scene(raw: dict, tau: float = 0., *, worldsheet: bool = False) -> dict[str, Any]:
    """Verified native SGEO snapshot from writer -> reader -> scene geometry."""
    content=export_sgeo(raw,tau,worldsheet=worldsheet)
    view=_native_scene_from_bytes(content,source='canonical_roundtrip',requested_time=float(tau))
    view['coordinate_axes']=validated(raw)['projection']
    view['geometry_scope']='3D projection; omitted target coordinates remain in experiment JSON'
    return view
