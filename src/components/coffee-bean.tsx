"use client";

import { useEffect, useRef } from "react";
import {
  beanFragmentSource,
  beanMesh,
  beanReliefPixels,
  beanRotation,
  beanVertexSource,
} from "./coffee-bean-surface";

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
  const updateRoast = useRef<((value: number) => void) | null>(null);
  const isSculpture =
    ["clara", "media", "escura"].includes(roast) ||
    imageUrl === "/images/coffee-bean.png";

  useEffect(() => {
    const element = container.current;
    const target = canvas.current;
    if (!element || !target || !isSculpture) return;
    const gl = target.getContext("webgl", { alpha: true, antialias: true });
    if (!gl) return;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = matchMedia("(pointer: fine)");
    let disposeRenderer: (() => void) | undefined;

    const initialize = () => {
      const shaders: WebGLShader[] = [];
      const program = gl.createProgram();
      const buffer = gl.createBuffer();
      const indexBuffer = gl.createBuffer();
      const skinTexture = gl.createTexture();
      const reliefTexture = gl.createTexture();
      const frontTexture = gl.createTexture();
      const release = () => {
        gl.deleteTexture(skinTexture);
        gl.deleteTexture(reliefTexture);
        gl.deleteTexture(frontTexture);
        gl.deleteBuffer(buffer);
        gl.deleteBuffer(indexBuffer);
        gl.deleteProgram(program);
        shaders.forEach((shader) => gl.deleteShader(shader));
      };
      if (
        !program ||
        !buffer ||
        !indexBuffer ||
        !skinTexture ||
        !reliefTexture ||
        !frontTexture
      ) {
        release();
        return;
      }
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
      const fragmentSource = gl.getExtension("OES_standard_derivatives")
        ? "#extension GL_OES_standard_derivatives : enable\n#define SURFACE_DERIVATIVES\n" +
          beanFragmentSource
        : beanFragmentSource;
      if (
        !compile(gl.VERTEX_SHADER, beanVertexSource) ||
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
      gl.clearColor(0, 0, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, skinTexture);
      // A neutral texel keeps the procedural material usable if the image fails.
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([130, 60, 27, 255]),
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.uniform1i(gl.getUniformLocation(program, "skinSurface"), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, reliefTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([128, 128, 255, 255]),
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.uniform1i(gl.getUniformLocation(program, "skinRelief"), 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, frontTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([0, 0, 0, 0]),
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.uniform1i(gl.getUniformLocation(program, "frontSurface"), 2);
      const rotationUniform = gl.getUniformLocation(program, "rotation");
      const liftUniform = gl.getUniformLocation(program, "lift");
      const roastUniform = gl.getUniformLocation(program, "roast");
      let frame = 0;
      let disposed = false;
      let visible = false;
      let lastTime = 0;
      let elapsed = 0;
      let scrollAngle = 0;
      let dragAngle = 0;
      let pointerX = 0;
      let pointerY = 0;
      let yaw = -0.2;
      let pitch = -0.12;
      let roastValue = Number(element.dataset.roast);
      let nextRoast = roastValue;
      let activePointer: number | null = null;
      let lastX = 0;
      let needsMeasure = true;

      const measure = () => {
        const bounds = element.getBoundingClientRect();
        const progress = Math.max(
          0,
          Math.min(
            1,
            (innerHeight - bounds.top) / (innerHeight + bounds.height),
          ),
        );
        scrollAngle = (progress - 0.5) * Math.PI * 2.5;
        const size = Math.max(
          1,
          Math.round(bounds.width * Math.min(devicePixelRatio || 1, 1.75)),
        );
        if (target.width !== size || target.height !== size) {
          target.width = size;
          target.height = size;
          gl.viewport(0, 0, size, size);
        }
        needsMeasure = false;
      };
      const draw = (now: number) => {
        frame = 0;
        if (disposed || !visible || document.hidden || gl.isContextLost())
          return;
        if (needsMeasure) measure();
        const delta = lastTime
          ? Math.min((now - lastTime) / 1000, 0.05)
          : 1 / 60;
        lastTime = now;
        const still = reducedMotion.matches;
        if (!still) elapsed += delta;
        const easing = still ? 1 : 1 - Math.exp(-delta * 9);
        const targetYaw =
          -0.2 + dragAngle + (still ? 0 : scrollAngle + pointerX * 0.16);
        const targetPitch =
          -0.12 +
          (still ? 0 : pointerY * 0.12 + Math.sin(elapsed * 0.6) * 0.025);
        yaw += (targetYaw - yaw) * easing;
        pitch += (targetPitch - pitch) * easing;
        roastValue +=
          (nextRoast - roastValue) * (still ? 1 : 1 - Math.exp(-delta * 5));
        const lift = still ? 0 : Math.sin(elapsed * 0.9) * 0.018;
        const roll = -0.19 + (still ? 0 : Math.sin(elapsed * 0.45) * 0.025);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.uniformMatrix3fv(
          rotationUniform,
          false,
          beanRotation(yaw, pitch, roll),
        );
        gl.uniform1f(liftUniform, lift);
        gl.uniform1f(roastUniform, roastValue);
        gl.drawElements(
          gl.TRIANGLES,
          mesh.indices.length,
          gl.UNSIGNED_SHORT,
          0,
        );
        target.dataset.angle = ((yaw * 180) / Math.PI).toFixed(2);
        element.dataset.ready = "true";
        element.style.setProperty("--bean-shadow-scale", String(1 - lift * 2));
        if (!still) frame = requestAnimationFrame(draw);
      };
      const schedule = () => {
        if (!disposed && visible && !document.hidden && !frame)
          frame = requestAnimationFrame(draw);
      };
      const front = new Image();
      front.onload = () => {
        if (disposed || gl.isContextLost()) return;
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, frontTexture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          front,
        );
        schedule();
      };
      front.src = "/images/coffee-bean.png";
      const skin = new Image();
      skin.onload = () => {
        if (disposed || gl.isContextLost()) return;
        const source = document.createElement("canvas");
        source.width = skin.naturalWidth;
        source.height = skin.naturalHeight;
        const context = source.getContext("2d");
        if (context) {
          context.drawImage(skin, 0, 0);
          const pixels = context.getImageData(
            0,
            0,
            source.width,
            source.height,
          );
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, reliefTexture);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            source.width,
            source.height,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            beanReliefPixels(pixels),
          );
          gl.generateMipmap(gl.TEXTURE_2D);
          gl.texParameteri(
            gl.TEXTURE_2D,
            gl.TEXTURE_MIN_FILTER,
            gl.LINEAR_MIPMAP_LINEAR,
          );
        }
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, skinTexture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          skin,
        );
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(
          gl.TEXTURE_2D,
          gl.TEXTURE_MIN_FILTER,
          gl.LINEAR_MIPMAP_LINEAR,
        );
        schedule();
      };
      skin.src = "/images/coffee-skin-v5.webp";
      const changed = () => {
        needsMeasure = true;
        schedule();
      };
      const motionChanged = () => {
        lastTime = 0;
        schedule();
      };
      updateRoast.current = (value) => {
        nextRoast = value;
        schedule();
      };
      const observer = new ResizeObserver(changed);
      observer.observe(element);
      const visibility = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) {
          lastTime = 0;
          changed();
        } else {
          cancelAnimationFrame(frame);
          frame = 0;
        }
      });
      visibility.observe(element);
      const documentVisibility = () => {
        if (document.hidden) {
          cancelAnimationFrame(frame);
          frame = 0;
        } else {
          lastTime = 0;
          changed();
        }
      };
      const pointerDown = (event: PointerEvent) => {
        if (!event.isPrimary || event.button !== 0) return;
        activePointer = event.pointerId;
        lastX = event.clientX;
        element.setPointerCapture(event.pointerId);
        element.dataset.dragging = "true";
      };
      const pointerMove = (event: PointerEvent) => {
        if (activePointer === event.pointerId) {
          dragAngle += (event.clientX - lastX) * 0.012;
          lastX = event.clientX;
          schedule();
        } else if (finePointer.matches && !reducedMotion.matches) {
          const bounds = element.getBoundingClientRect();
          pointerX = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
          pointerY = ((event.clientY - bounds.top) / bounds.height) * 2 - 1;
          schedule();
        }
      };
      const pointerUp = (event: PointerEvent) => {
        if (activePointer !== event.pointerId) return;
        activePointer = null;
        delete element.dataset.dragging;
        if (element.hasPointerCapture(event.pointerId))
          element.releasePointerCapture(event.pointerId);
      };
      const pointerLeave = () => {
        pointerX = 0;
        pointerY = 0;
        schedule();
      };
      const keyDown = (event: KeyboardEvent) => {
        if (
          event.key !== "ArrowLeft" &&
          event.key !== "ArrowRight" &&
          event.key !== "Home"
        )
          return;
        event.preventDefault();
        if (event.key === "Home")
          dragAngle = reducedMotion.matches ? 0 : -scrollAngle;
        else
          dragAngle += event.key === "ArrowRight" ? Math.PI / 8 : -Math.PI / 8;
        schedule();
      };
      window.addEventListener("scroll", changed, { passive: true });
      window.addEventListener("resize", changed);
      document.addEventListener("visibilitychange", documentVisibility);
      reducedMotion.addEventListener("change", motionChanged);
      element.addEventListener("pointerdown", pointerDown);
      element.addEventListener("pointermove", pointerMove);
      element.addEventListener("pointerup", pointerUp);
      element.addEventListener("pointercancel", pointerUp);
      element.addEventListener("lostpointercapture", pointerUp);
      element.addEventListener("pointerleave", pointerLeave);
      element.addEventListener("keydown", keyDown);
      disposeRenderer = () => {
        disposed = true;
        front.onload = null;
        skin.onload = null;
        cancelAnimationFrame(frame);
        observer.disconnect();
        visibility.disconnect();
        window.removeEventListener("scroll", changed);
        window.removeEventListener("resize", changed);
        document.removeEventListener("visibilitychange", documentVisibility);
        reducedMotion.removeEventListener("change", motionChanged);
        element.removeEventListener("pointerdown", pointerDown);
        element.removeEventListener("pointermove", pointerMove);
        element.removeEventListener("pointerup", pointerUp);
        element.removeEventListener("pointercancel", pointerUp);
        element.removeEventListener("lostpointercapture", pointerUp);
        element.removeEventListener("pointerleave", pointerLeave);
        element.removeEventListener("keydown", keyDown);
        updateRoast.current = null;
        delete element.dataset.ready;
        delete element.dataset.dragging;
        element.style.removeProperty("--bean-shadow-scale");
        release();
      };
    };
    const lost = (event: Event) => {
      event.preventDefault();
      disposeRenderer?.();
      disposeRenderer = undefined;
    };
    const restored = () => initialize();
    target.addEventListener("webglcontextlost", lost);
    target.addEventListener("webglcontextrestored", restored);
    initialize();
    return () => {
      disposeRenderer?.();
      target.removeEventListener("webglcontextlost", lost);
      target.removeEventListener("webglcontextrestored", restored);
    };
  }, [isSculpture]);

  useEffect(() => {
    updateRoast.current?.(roast === "clara" ? 0 : roast === "escura" ? 2 : 1);
  }, [roast]);

  return (
    <div
      ref={container}
      className={`coffee-bean ${isSculpture ? `bean-${roast} bean-sculpture` : ""}`}
      data-roast={roast === "clara" ? 0 : roast === "escura" ? 2 : 1}
      role="img"
      tabIndex={isSculpture ? 0 : undefined}
      aria-label={`Grão de café de ${name.toLowerCase()}${isSculpture ? ". Arraste ou use as setas esquerda e direita para girar. Home retorna à frente." : ""}`}
    >
      <img
        className="bean-fallback"
        src={isSculpture ? "/images/coffee-bean.png" : imageUrl}
        width="600"
        height="600"
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <canvas ref={canvas} aria-hidden="true" />
    </div>
  );
}
