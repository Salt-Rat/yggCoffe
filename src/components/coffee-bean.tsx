"use client";

import { useEffect, useRef } from "react";

const vertexSource = `
  attribute vec3 position;
  attribute vec3 normal;
  uniform float angle;
  varying vec3 point;
  varying vec3 objectNormal;
  varying vec3 worldNormal;
  void main() {
    float c = cos(angle), s = sin(angle);
    mat3 rotation = mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
    vec3 rotated = rotation * position;
    point = position;
    objectNormal = normal;
    worldNormal = rotation * normal;
    gl_Position = vec4(rotated.xy / 1.12, -rotated.z / 2.0, 1.0);
  }
`;

// Render the bean's asymmetric surface, then light its textured skin.
// Rotation changes the visible surface rather than rotating a flat image.
const fragmentSource = `
  precision highp float;
  uniform sampler2D frontSurface;
  uniform sampler2D skinSurface;
  varying vec3 point;
  varying vec3 objectNormal;
  varying vec3 worldNormal;
  void main() {
    vec3 normal = normalize(objectNormal);
    // Blend three planar samples to keep grain density constant around the bean.
    // Unlike longitude mapping, this has no stretched poles or mirrored strip.
    vec3 weights = pow(abs(normal), vec3(4.0));
    weights /= weights.x + weights.y + weights.z;
    vec3 p = point * 1.25 + vec3(0.17, 0.31, 0.23);
    vec3 skin = texture2D(skinSurface, p.yz).rgb * weights.x
              + texture2D(skinSurface, p.xz).rgb * weights.y
              + texture2D(skinSurface, p.xy).rgb * weights.z;
    vec4 front = texture2D(frontSurface, vec2(0.49 + point.x / 0.70 * 0.315, 0.49 - point.y * 0.45));
    float face = smoothstep(0.05, 0.24, point.z) * front.a;
    vec3 color = mix(skin, front.rgb, face);
    float crease = point.x - (0.035 * sin(point.y * 3.5) + 0.015);
    float occlusion = 1.0 - 0.40 * exp(-pow(crease / 0.055, 2.0)) * smoothstep(0.05, 0.15, point.z);
    vec3 light = normalize(vec3(-0.65, 0.8, 1.5));
    vec3 n = normalize(worldNormal);
    float diffuse = max(0.0, dot(n, light));
    vec3 halfway = normalize(light + vec3(0.0, 0.0, 1.0));
    float specular = pow(max(0.0, dot(n, halfway)), 28.0) * 0.035;
    gl_FragColor = vec4(color * (0.48 + diffuse * 0.54) * occlusion + specular, 1.0);
  }
`;

function beanPoint(latitude: number, longitude: number) {
  const y = Math.cos(latitude);
  const ring = Math.sin(latitude);
  const front = Math.cos(longitude);
  const x =
    0.7 * ring * Math.sin(longitude) * (1 + 0.055 * y) +
    0.025 * ring * ring * Math.sin(y * 3);
  const crease = 0.035 * Math.sin(y * 3.5) + 0.015;
  // A coffee bean has a domed back and a flatter, cleft front, not two equal halves.
  let z = ring * front * (front > 0 ? 0.31 : 0.49);
  if (front > 0) {
    z -=
      0.14 *
      Math.exp(-(((x - crease) / 0.075) ** 2)) *
      Math.sqrt(ring) *
      Math.min(1, front * 4);
  }
  return [x, y, z];
}

function beanMesh() {
  const latitudes = 80,
    longitudes = 128;
  const vertices: number[] = [],
    indices: number[] = [];
  for (let i = 0; i <= latitudes; i++) {
    // Avoid degenerate normals at the two poles.
    const latitude = Math.max(
      0.0001,
      Math.min(Math.PI - 0.0001, (i / latitudes) * Math.PI),
    );
    for (let j = 0; j <= longitudes; j++) {
      const longitude = (j / longitudes) * Math.PI * 2;
      const point = beanPoint(latitude, longitude);
      const a = beanPoint(latitude + 0.0001, longitude);
      const b = beanPoint(latitude, longitude + 0.0001);
      const u = a.map((v, index) => v - point[index]);
      const v = b.map((value, index) => value - point[index]);
      const normal = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ];
      const length = Math.hypot(...normal);
      vertices.push(...point, ...normal.map((value) => value / length));
      if (i < latitudes && j < longitudes) {
        const start = i * (longitudes + 1) + j;
        indices.push(
          start,
          start + longitudes + 1,
          start + 1,
          start + 1,
          start + longitudes + 1,
          start + longitudes + 2,
        );
      }
    }
  }
  return {
    vertices: new Float32Array(vertices),
    indices: new Uint16Array(indices),
  };
}

export function CoffeeBean({
  imageUrl,
  name,
  roast,
}: {
  imageUrl: string;
  name: string;
  roast: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = container.current;
    const target = canvas.current;
    if (!element || !target) return;
    const gl = target.getContext("webgl", { alpha: true, antialias: true });
    if (!gl) return;
    const shaders: WebGLShader[] = [];
    const program = gl.createProgram();
    const buffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();
    const frontTexture = gl.createTexture();
    const skinTexture = gl.createTexture();
    if (!program || !buffer || !indexBuffer || !frontTexture || !skinTexture)
      return;
    const textures = [frontTexture, skinTexture];
    let frame = 0;
    let loaded = 0;
    let disposed = false;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return false;
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return false;
      gl.attachShader(program, shader);
      return true;
    };
    const release = () => {
      textures.forEach((texture) => gl.deleteTexture(texture));
      gl.deleteBuffer(buffer);
      gl.deleteBuffer(indexBuffer);
      gl.deleteProgram(program);
      shaders.forEach((shader) => gl.deleteShader(shader));
    };
    if (
      !compile(gl.VERTEX_SHADER, vertexSource) ||
      !compile(gl.FRAGMENT_SHADER, fragmentSource)
    ) {
      release();
      return;
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      release();
      return;
    }
    gl.useProgram(program);
    const mesh = beanMesh();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "position");
    const normal = gl.getAttribLocation(program, "normal");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(normal);
    gl.vertexAttribPointer(normal, 3, gl.FLOAT, false, 24, 12);
    gl.enable(gl.DEPTH_TEST);
    gl.uniform1i(gl.getUniformLocation(program, "frontSurface"), 0);
    gl.uniform1i(gl.getUniformLocation(program, "skinSurface"), 1);
    const angleUniform = gl.getUniformLocation(program, "angle");
    const draw = () => {
      frame = 0;
      if (loaded !== 2 || disposed || gl.isContextLost()) return;
      const bounds = element.parentElement!.getBoundingClientRect();
      const center = bounds.top + bounds.height / 2;
      const travel = (innerHeight + bounds.height) / 2;
      const progress = Math.max(
        0,
        Math.min(1, 1 - (center - innerHeight / 2) / travel),
      );
      const angle = reducedMotion.matches ? 0 : Math.PI * (1 - progress);
      const size = Math.round(
        element.clientWidth * Math.min(devicePixelRatio, 2),
      );
      if (target.width !== size || target.height !== size) {
        target.width = size;
        target.height = size;
        gl.viewport(0, 0, size, size);
      }
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniform1f(angleUniform, angle);
      gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
      target.dataset.angle = String((angle * 180) / Math.PI);
      element.dataset.ready = "true";
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const images = [imageUrl, "/images/coffee-skin-v2.webp"].map(
      (src, index) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => {
          if (disposed) return;
          gl.activeTexture(gl.TEXTURE0 + index);
          gl.bindTexture(gl.TEXTURE_2D, textures[index]);
          gl.texParameteri(
            gl.TEXTURE_2D,
            gl.TEXTURE_WRAP_S,
            index === 1 ? gl.REPEAT : gl.CLAMP_TO_EDGE,
          );
          gl.texParameteri(
            gl.TEXTURE_2D,
            gl.TEXTURE_WRAP_T,
            index === 1 ? gl.REPEAT : gl.CLAMP_TO_EDGE,
          );
          gl.texParameteri(
            gl.TEXTURE_2D,
            gl.TEXTURE_MIN_FILTER,
            index === 1 ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR,
          );
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            image,
          );
          if (index === 1) gl.generateMipmap(gl.TEXTURE_2D);
          loaded++;
          schedule();
        };
        image.src = src;
        return image;
      },
    );
    const observer = new ResizeObserver(schedule);
    observer.observe(element.parentElement!);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    reducedMotion.addEventListener("change", schedule);
    const lost = (event: Event) => {
      event.preventDefault();
      delete element.dataset.ready;
    };
    target.addEventListener("webglcontextlost", lost);
    return () => {
      disposed = true;
      images.forEach((image) => {
        image.onload = null;
      });
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      reducedMotion.removeEventListener("change", schedule);
      target.removeEventListener("webglcontextlost", lost);
      delete element.dataset.ready;
      release();
    };
  }, [imageUrl]);

  return (
    <div
      ref={container}
      className={`coffee-bean ${imageUrl === "/images/coffee-bean.png" ? `bean-${roast}` : ""}`}
      role="img"
      aria-label={`Grão de café de ${name.toLowerCase()}`}
    >
      <img
        className="bean-fallback"
        src={imageUrl}
        width="600"
        height="600"
        alt=""
        aria-hidden="true"
      />
      <canvas ref={canvas} aria-hidden="true" />
    </div>
  );
}
