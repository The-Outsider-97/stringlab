import { PT_FLOATS, SEG_FLOATS, TRI_FLOATS } from './scene.js';
const NO_TAU = -1e29;
// ---------------------------------------------------------------------------------------------------------------- WebGL2
const SEG_VERT = `#version 300 es
precision highp float;
in vec3 a_p0; in vec3 a_p1; in vec4 a_c0; in vec4 a_c1; in float a_w; in float a_tau;
uniform mat4 u_vp; uniform vec2 u_res; uniform float u_time; uniform float u_dpr;
out vec4 v_col; out float v_dist; out float v_half; out float v_tau;
void main() {
  int id = gl_VertexID;
  float along = (id == 1 || id == 3) ? 1.0 : 0.0;
  float side = (id < 2) ? -1.0 : 1.0;
  vec4 c0 = u_vp * vec4(a_p0, 1.0);
  vec4 c1 = u_vp * vec4(a_p1, 1.0);
  const float NEAR = 0.002;
  if (c0.w < NEAR && c1.w < NEAR) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); v_col = vec4(0.0); v_dist = 0.0; v_half = 0.0; v_tau = 0.0; return; }
  if (c0.w < NEAR) c0 = mix(c0, c1, (NEAR - c0.w) / (c1.w - c0.w));
  if (c1.w < NEAR) c1 = mix(c1, c0, (NEAR - c1.w) / (c0.w - c1.w));
  vec2 s0 = c0.xy / c0.w * u_res * 0.5;
  vec2 s1 = c1.xy / c1.w * u_res * 0.5;
  vec2 d = s1 - s0;
  float len = length(d);
  d = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 n = vec2(-d.y, d.x);
  float half_w = a_w * u_dpr * 0.5 + 0.75;
  vec2 pos = mix(s0, s1, along) + n * side * half_w + d * (along * 2.0 - 1.0) * half_w * 0.5;
  float depth = mix(c0.z / c0.w, c1.z / c1.w, along);
  gl_Position = vec4(pos / (u_res * 0.5), depth, 1.0);
  v_col = mix(a_c0, a_c1, along);
  v_dist = side * half_w; v_half = half_w; v_tau = a_tau;
}`;
const SEG_FRAG = `#version 300 es
precision highp float;
in vec4 v_col; in float v_dist; in float v_half; in float v_tau;
uniform float u_time;
out vec4 o;
void main() {
  if (v_tau > -1e29 && v_tau > u_time) discard;
  float a = clamp(v_half - abs(v_dist) + 0.5, 0.0, 1.0);
  o = vec4(v_col.rgb, v_col.a * a);
  if (o.a <= 0.003) discard;
}`;
const PT_VERT = `#version 300 es
precision highp float;
in vec3 a_pos; in vec4 a_col; in float a_size;
uniform mat4 u_vp; uniform vec2 u_res; uniform float u_dpr;
out vec4 v_col; out vec2 v_uv; out float v_r;
void main() {
  int id = gl_VertexID;
  vec2 corner = vec2((id == 1 || id == 3) ? 1.0 : -1.0, (id < 2) ? -1.0 : 1.0);
  vec4 c = u_vp * vec4(a_pos, 1.0);
  if (c.w < 0.002) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); v_col = vec4(0.0); v_uv = vec2(0.0); v_r = 0.0; return; }
  float r = a_size * u_dpr * 0.5 + 1.0;
  vec2 ndc = c.xy / c.w + corner * r / (u_res * 0.5);
  gl_Position = vec4(ndc, c.z / c.w, 1.0);
  v_col = a_col; v_uv = corner * r; v_r = r;
}`;
const PT_FRAG = `#version 300 es
precision highp float;
in vec4 v_col; in vec2 v_uv; in float v_r;
out vec4 o;
void main() {
  float d = length(v_uv);
  float a = clamp(v_r - d, 0.0, 1.0);
  float shade = 0.72 + 0.28 * (1.0 - clamp(length(v_uv - vec2(-0.3, 0.3) * v_r) / v_r, 0.0, 1.0));
  o = vec4(v_col.rgb * shade, v_col.a * a);
  if (o.a <= 0.003) discard;
}`;
const TRI_VERT = `#version 300 es
precision highp float;
in vec3 a_pos; in vec3 a_nor; in vec4 a_col; in float a_tau;
uniform mat4 u_vp; uniform vec3 u_view;
out vec4 v_col; out float v_tau;
void main() {
  gl_Position = u_vp * vec4(a_pos, 1.0);
  float light = 0.55 + 0.45 * abs(dot(normalize(a_nor), u_view));
  v_col = vec4(a_col.rgb * light, a_col.a); v_tau = a_tau;
}`;
const TRI_FRAG = `#version 300 es
precision highp float;
in vec4 v_col; in float v_tau;
uniform float u_time;
out vec4 o;
void main() {
  if (v_tau > -1e29 && v_tau > u_time) discard;
  o = v_col;
}`;
export class GLRenderer {
    canvas;
    kind = 'webgl2';
    gl;
    seg;
    pt;
    tri;
    slots = [];
    vaos = new Map();
    lost = false;
    size = { w: 1, h: 1, dpr: 1 };
    constructor(canvas) {
        this.canvas = canvas;
        const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
        if (!gl)
            throw new Error('WebGL2 is not available.');
        this.gl = gl;
        this.build();
        canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
        canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.slots = []; this.vaos.clear(); this.build(); });
    }
    build() {
        this.seg = new Program(this.gl, SEG_VERT, SEG_FRAG, ['u_vp', 'u_res', 'u_time', 'u_dpr']);
        this.pt = new Program(this.gl, PT_VERT, PT_FRAG, ['u_vp', 'u_res', 'u_dpr']);
        this.tri = new Program(this.gl, TRI_VERT, TRI_FRAG, ['u_vp', 'u_time', 'u_view']);
    }
    resize(width, height, dpr) {
        this.size = { w: width, h: height, dpr };
        const w = Math.max(1, Math.round(width * dpr)), h = Math.max(1, Math.round(height * dpr));
        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = w;
            this.canvas.height = h;
        }
    }
    slot(index) {
        let slot = this.slots[index];
        if (!slot) {
            const make = () => { const b = this.gl.createBuffer(); if (!b)
                throw new Error('WebGL buffer allocation failed.'); return b; };
            slot = { source: null, segs: make(), pts: make(), tris: make() };
            this.slots[index] = slot;
        }
        return slot;
    }
    vao(key, setup) {
        let vao = this.vaos.get(key);
        if (!vao) {
            vao = this.gl.createVertexArray();
            this.gl.bindVertexArray(vao);
            setup();
            this.vaos.set(key, vao);
        }
        return vao;
    }
    draw(a) {
        if (this.lost)
            return;
        const gl = this.gl;
        const w = this.canvas.width, h = this.canvas.height;
        gl.viewport(0, 0, w, h);
        gl.clearColor(a.background[0], a.background[1], a.background[2], 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        const dpr = w / Math.max(1, this.size.w);
        a.layers.forEach((layer, index) => {
            const slot = this.slot(index);
            const fresh = slot.source !== layer;
            if (fresh) {
                slot.source = layer;
                gl.bindBuffer(gl.ARRAY_BUFFER, slot.segs);
                gl.bufferData(gl.ARRAY_BUFFER, layer.segs, gl.DYNAMIC_DRAW);
                gl.bindBuffer(gl.ARRAY_BUFFER, slot.pts);
                gl.bufferData(gl.ARRAY_BUFFER, layer.pts, gl.DYNAMIC_DRAW);
                gl.bindBuffer(gl.ARRAY_BUFFER, slot.tris);
                gl.bufferData(gl.ARRAY_BUFFER, layer.tris, gl.DYNAMIC_DRAW);
            }
            if (layer.nTri) {
                const p = this.tri;
                gl.useProgram(p.program);
                gl.uniformMatrix4fv(p.u.u_vp, false, a.vp);
                gl.uniform1f(p.u.u_time, a.time);
                gl.uniform3f(p.u.u_view, a.viewDir[0], a.viewDir[1], a.viewDir[2]);
                gl.bindVertexArray(this.vao(`tri${index}`, () => {
                    gl.bindBuffer(gl.ARRAY_BUFFER, slot.tris);
                    const stride = TRI_FLOATS * 4;
                    attrib(gl, p.program, 'a_pos', 3, stride, 0, 0);
                    attrib(gl, p.program, 'a_nor', 3, stride, 12, 0);
                    attrib(gl, p.program, 'a_col', 4, stride, 24, 0);
                    attrib(gl, p.program, 'a_tau', 1, stride, 40, 0);
                }));
                gl.bindBuffer(gl.ARRAY_BUFFER, slot.tris);
                gl.drawArrays(gl.TRIANGLES, 0, layer.nTri * 3);
            }
        });
        a.layers.forEach((layer, index) => {
            const slot = this.slot(index);
            if (layer.nSeg) {
                const p = this.seg;
                gl.useProgram(p.program);
                gl.uniformMatrix4fv(p.u.u_vp, false, a.vp);
                gl.uniform2f(p.u.u_res, w, h);
                gl.uniform1f(p.u.u_time, a.time);
                gl.uniform1f(p.u.u_dpr, dpr);
                gl.bindVertexArray(this.vao(`seg${index}`, () => {
                    gl.bindBuffer(gl.ARRAY_BUFFER, slot.segs);
                    const stride = SEG_FLOATS * 4;
                    attrib(gl, p.program, 'a_p0', 3, stride, 0, 1);
                    attrib(gl, p.program, 'a_p1', 3, stride, 12, 1);
                    attrib(gl, p.program, 'a_c0', 4, stride, 24, 1);
                    attrib(gl, p.program, 'a_c1', 4, stride, 40, 1);
                    attrib(gl, p.program, 'a_w', 1, stride, 56, 1);
                    attrib(gl, p.program, 'a_tau', 1, stride, 60, 1);
                }));
                gl.bindBuffer(gl.ARRAY_BUFFER, slot.segs);
                gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, layer.nSeg);
            }
        });
        a.layers.forEach((layer, index) => {
            const slot = this.slot(index);
            if (layer.nPt) {
                const p = this.pt;
                gl.useProgram(p.program);
                gl.uniformMatrix4fv(p.u.u_vp, false, a.vp);
                gl.uniform2f(p.u.u_res, w, h);
                gl.uniform1f(p.u.u_dpr, dpr);
                gl.bindVertexArray(this.vao(`pt${index}`, () => {
                    gl.bindBuffer(gl.ARRAY_BUFFER, slot.pts);
                    const stride = PT_FLOATS * 4;
                    attrib(gl, p.program, 'a_pos', 3, stride, 0, 1);
                    attrib(gl, p.program, 'a_col', 4, stride, 12, 1);
                    attrib(gl, p.program, 'a_size', 1, stride, 28, 1);
                }));
                gl.bindBuffer(gl.ARRAY_BUFFER, slot.pts);
                gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, layer.nPt);
            }
        });
        gl.bindVertexArray(null);
    }
    dispose() {
        const gl = this.gl;
        for (const s of this.slots) {
            gl.deleteBuffer(s.segs);
            gl.deleteBuffer(s.pts);
            gl.deleteBuffer(s.tris);
        }
        for (const v of this.vaos.values())
            gl.deleteVertexArray(v);
        this.slots = [];
        this.vaos.clear();
        gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
}
class Program {
    program;
    u = {};
    constructor(gl, vert, frag, uniforms) {
        const compile = (type, source) => {
            const sh = gl.createShader(type);
            gl.shaderSource(sh, source);
            gl.compileShader(sh);
            if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
                throw new Error(`Shader compilation failed: ${gl.getShaderInfoLog(sh) ?? ''}`);
            return sh;
        };
        const v = compile(gl.VERTEX_SHADER, vert), f = compile(gl.FRAGMENT_SHADER, frag);
        this.program = gl.createProgram();
        gl.attachShader(this.program, v);
        gl.attachShader(this.program, f);
        gl.linkProgram(this.program);
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
            throw new Error(`Shader link failed: ${gl.getProgramInfoLog(this.program) ?? ''}`);
        gl.deleteShader(v);
        gl.deleteShader(f);
        for (const name of uniforms)
            this.u[name] = gl.getUniformLocation(this.program, name);
    }
}
function attrib(gl, program, name, size, stride, offset, divisor) {
    const loc = gl.getAttribLocation(program, name);
    if (loc < 0)
        return;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
    gl.vertexAttribDivisor(loc, divisor);
}
// ---------------------------------------------------------------------------------------------------------------- 2D fallback
const css = (c, alpha = c[3]) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
export class Canvas2DRenderer {
    canvas;
    kind = 'canvas2d';
    ctx;
    size = { w: 1, h: 1, dpr: 1 };
    constructor(canvas) {
        this.canvas = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            throw new Error('Canvas 2D is not available.');
        this.ctx = ctx;
    }
    resize(width, height, dpr) {
        this.size = { w: width, h: height, dpr };
        const w = Math.max(1, Math.round(width * dpr)), h = Math.max(1, Math.round(height * dpr));
        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = w;
            this.canvas.height = h;
        }
    }
    draw(a) {
        const { ctx } = this;
        const { w, h, dpr } = this.size;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = css(a.background, 1);
        ctx.fillRect(0, 0, w, h);
        const m = a.vp;
        const g = (i) => m[i] ?? 0;
        // clip-space w, then pixels; null when behind the camera
        const project = (x, y, z) => {
            const cw = g(3) * x + g(7) * y + g(11) * z + g(15);
            if (cw < 0.002)
                return null;
            return [((g(0) * x + g(4) * y + g(8) * z + g(12)) / cw * 0.5 + 0.5) * w, (1 - ((g(1) * x + g(5) * y + g(9) * z + g(13)) / cw * 0.5 + 0.5)) * h];
        };
        ctx.lineCap = 'round';
        for (const layer of a.layers) {
            const t = layer.tris;
            for (let k = 0; k < layer.nTri; k++) {
                const o = k * 3 * TRI_FLOATS;
                if (t[o + 10] > NO_TAU && t[o + 10] > a.time)
                    continue;
                const p0 = project(t[o], t[o + 1], t[o + 2]), p1 = project(t[o + TRI_FLOATS], t[o + TRI_FLOATS + 1], t[o + TRI_FLOATS + 2]), p2 = project(t[o + 2 * TRI_FLOATS], t[o + 2 * TRI_FLOATS + 1], t[o + 2 * TRI_FLOATS + 2]);
                if (!p0 || !p1 || !p2)
                    continue;
                ctx.fillStyle = css([t[o + 6], t[o + 7], t[o + 8], t[o + 9]]);
                ctx.beginPath();
                ctx.moveTo(p0[0], p0[1]);
                ctx.lineTo(p1[0], p1[1]);
                ctx.lineTo(p2[0], p2[1]);
                ctx.closePath();
                ctx.fill();
            }
        }
        for (const layer of a.layers) {
            const s = layer.segs;
            for (let k = 0; k < layer.nSeg; k++) {
                const o = k * SEG_FLOATS;
                const tau = s[o + 15];
                if (tau > NO_TAU && tau > a.time)
                    continue;
                const p0 = project(s[o], s[o + 1], s[o + 2]), p1 = project(s[o + 3], s[o + 4], s[o + 5]);
                if (!p0 || !p1)
                    continue;
                ctx.strokeStyle = css([(s[o + 6] + s[o + 10]) / 2, (s[o + 7] + s[o + 11]) / 2, (s[o + 8] + s[o + 12]) / 2,
                    (s[o + 9] + s[o + 13]) / 2]);
                ctx.lineWidth = Math.max(0.75, s[o + 14]);
                ctx.beginPath();
                ctx.moveTo(p0[0], p0[1]);
                ctx.lineTo(p1[0], p1[1]);
                ctx.stroke();
            }
        }
        for (const layer of a.layers) {
            const p = layer.pts;
            for (let k = 0; k < layer.nPt; k++) {
                const o = k * PT_FLOATS;
                const q = project(p[o], p[o + 1], p[o + 2]);
                if (!q)
                    continue;
                ctx.fillStyle = css([p[o + 3], p[o + 4], p[o + 5], p[o + 6]]);
                ctx.beginPath();
                ctx.arc(q[0], q[1], Math.max(1, p[o + 7] / 2), 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    dispose() { }
}
//# sourceMappingURL=renderer.js.map