// A single object-space material covers every side, including the recessed cleft.
// Its analytic noise gradients add pores without UV seams or baked-in lighting.
export const beanVertexSource = `
  attribute vec3 position;
  attribute vec3 normal;
  uniform mat3 rotation;
  uniform float lift;
  varying vec3 point;
  varying vec3 surfaceNormal;
  varying vec3 worldPoint;
  void main() {
    point = position;
    surfaceNormal = normal;
    worldPoint = rotation * position;
    vec3 view = worldPoint + vec3(0.0, lift, 0.0);
    float distance = 4.5 - view.z;
    gl_Position = vec4(view.x * 3.65, view.y * 3.65, -view.z, distance);
  }
`;

// Render the bean's asymmetric surface, then light its textured skin.
// Rotation changes the visible surface rather than rotating a flat image.
export const beanFragmentSource = `
  precision highp float;
  uniform mat3 rotation;
  uniform float roast;
  uniform sampler2D skinSurface;
  uniform sampler2D skinRelief;
  uniform sampler2D frontSurface;
  varying vec3 point;
  varying vec3 surfaceNormal;
  varying vec3 worldPoint;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.13, 0.37, 0.71));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  // Value noise and its exact spatial gradient, evaluated together.
  vec4 grain(vec3 p) {
    vec3 cell = floor(p), f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    vec3 du = 6.0 * f * (1.0 - f);
    float a = hash(cell);
    float b = hash(cell + vec3(1, 0, 0));
    float c = hash(cell + vec3(0, 1, 0));
    float d = hash(cell + vec3(1, 1, 0));
    float e = hash(cell + vec3(0, 0, 1));
    float f1 = hash(cell + vec3(1, 0, 1));
    float g = hash(cell + vec3(0, 1, 1));
    float h = hash(cell + vec3(1, 1, 1));
    float lower = mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    float upper = mix(mix(e, f1, u.x), mix(g, h, u.x), u.y);
    vec3 gradient = vec3(
      mix(mix(b-a, d-c, u.y), mix(f1-e, h-g, u.y), u.z),
      mix(mix(c-a, d-b, u.x), mix(g-e, h-f1, u.x), u.z),
      upper-lower
    ) * du;
    return vec4(mix(lower, upper, u.z), gradient);
  }

  vec3 illuminate(vec3 n, vec3 v, vec3 light, vec3 tint, vec3 albedo, float roughness) {
    vec3 halfVector = normalize(light + v);
    float nl = max(dot(n, light), 0.0);
    float nv = max(dot(n, v), 0.001);
    float nh = max(dot(n, halfVector), 0.0);
    float vh = max(dot(v, halfVector), 0.0);
    float a = roughness * roughness;
    float a2 = a * a;
    float denominator = nh * nh * (a2 - 1.0) + 1.0;
    float distribution = a2 / (3.14159 * denominator * denominator);
    float k = (roughness + 1.0) * (roughness + 1.0) / 8.0;
    float visibility = nv / (nv * (1.0-k) + k) * nl / (nl * (1.0-k) + k);
    float fresnel = 0.035 + 0.965 * pow(1.0-vh, 5.0);
    float specular = distribution * visibility * fresnel / max(4.0 * nv * nl, 0.001);
    return (albedo * 0.96 / 3.14159 + specular) * tint * nl;
  }

  void main() {
    vec3 p = point;
    vec4 broad = grain(p * 4.8 + 8.0);
    vec3 wrinkleScale = vec3(24.0, 11.0, 24.0);
    vec4 wrinkles = grain(p * wrinkleScale + 19.0);
    vec4 pores = grain(p * 83.0 + 3.0);
    vec4 micro = grain(p * 195.0 + 27.0);
    vec3 gradient = wrinkles.yzw * wrinkleScale * 0.0006
                  + pores.yzw * 83.0 * 0.00015
                  + micro.yzw * 195.0 * 0.00005;
    vec3 objectNormal = normalize(surfaceNormal);
    gradient -= objectNormal * dot(gradient, objectNormal);
    vec3 n = normalize(rotation * normalize(objectNormal - gradient));
    vec3 v = normalize(vec3(0.0, 0.0, 4.5) - worldPoint);

    float center = 0.040 * sin(p.y * 3.6) + 0.012 * sin(p.y * 8.0) + 0.012;
    float groove = p.x - center;
    float width = 0.065 + 0.018 * (1.0 - p.y * p.y);
    float front = smoothstep(0.015, 0.13, p.z);
    float cleft = exp(-pow(groove / (width * 0.68), 2.0)) * front;
    float lip = exp(-pow((abs(groove) - width) / 0.026, 2.0)) * front;
    float fold = (1.0 - smoothstep(0.04, 0.28, wrinkles.x)) * 0.035;
    float variation = 0.94 + broad.x * 0.08 - fold;
    vec3 roastTint = roast < 1.0 ? mix(vec3(1.24, 1.17, 1.08), vec3(1.0), roast)
                               : mix(vec3(1.0), vec3(0.58, 0.52, 0.48), roast - 1.0);
    // Blend three planar samples to keep grain density constant around the bean.
    // Unlike longitude mapping, this has no stretched poles or mirrored strip.
    vec3 weights = pow(abs(objectNormal), vec3(4.0));
    weights /= weights.x + weights.y + weights.z;
    vec3 uv = p * 0.85 + vec3(0.17, 0.31, 0.23);
    vec3 skin = texture2D(skinSurface, uv.yz).rgb * weights.x
              + texture2D(skinSurface, uv.xz).rgb * weights.y
              + texture2D(skinSurface, uv.xy).rgb * weights.z;
    // Preserve the skin's chestnut color in linear light, using the same roast tint as the face.
    vec3 albedo = pow(skin * roastTint * 0.88, vec3(2.2)) * variation;
    // All roasts share the same normal map; only the albedo palette changes.
    vec3 reliefX = texture2D(skinRelief, uv.yz).xyz * 2.0 - 1.0;
    vec3 reliefY = texture2D(skinRelief, uv.xz).xyz * 2.0 - 1.0;
    vec3 reliefZ = texture2D(skinRelief, uv.xy).xyz * 2.0 - 1.0;
    vec3 relief = vec3(0.0, reliefX.xy / max(reliefX.z, 0.25)) * weights.x
                + vec3(reliefY.x, 0.0, reliefY.y) / max(reliefY.z, 0.25) * weights.y
                + vec3(reliefZ.xy / max(reliefZ.z, 0.25), 0.0) * weights.z;
    relief -= objectNormal * dot(relief, objectNormal);
    n = normalize(rotation * normalize(objectNormal + relief * 0.30 - gradient));
    #ifdef SURFACE_DERIVATIVES
      // Surface gradients make the photographed pores catch the moving light.
      float height = dot(skin, vec3(0.299, 0.587, 0.114)) * 0.0005;
      vec3 dx = dFdx(worldPoint), dy = dFdy(worldPoint);
      vec3 r1 = cross(dy, n), r2 = cross(n, dx);
      float determinant = dot(dx, r1);
      vec3 bump = sign(determinant) * (dFdx(height) * r1 + dFdy(height) * r2);
      n = normalize(max(abs(determinant), 0.0000001) * n - bump);
    #endif
    albedo *= 1.0 - cleft * 0.78;
    albedo *= 1.0 + lip * 0.10;
    // A narrow, broken ribbon of silver skin sits inside the cleft.
    float ribbonPosition = groove + 0.009 * sin(p.y * 43.0) + 0.005 * sin(p.y * 91.0);
    float ribbon = exp(-pow((ribbonPosition + 0.011) / 0.009, 2.0));
    ribbon *= smoothstep(0.30, 0.60, grain(p * vec3(15.0, 39.0, 15.0)).x);
    ribbon *= front * (1.0 - smoothstep(0.74, 0.94, abs(p.y)));
    albedo = mix(albedo, vec3(0.29, 0.15, 0.062), ribbon * 0.65);
    float roughness = 0.36 + (1.0 - dot(skin, vec3(0.299, 0.587, 0.114))) * 0.075;
    float occlusion = 1.0 - cleft * 0.58;
    vec3 color = albedo * vec3(0.28, 0.31, 0.35) * occlusion;
    color += illuminate(n, v, normalize(vec3(-1.7, 2.6, 3.0)), vec3(3.7, 3.2, 2.65), albedo, roughness) * occlusion;
    color += illuminate(n, v, normalize(vec3(2.8, 0.7, 1.4)), vec3(0.85, 0.92, 1.0), albedo, roughness);
    color += illuminate(n, v, normalize(vec3(0.6, 1.8, -2.5)), vec3(2.7, 1.85, 1.12), albedo, roughness);
    color = color / (vec3(1.0) + color * 0.35);
    color = pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));
    // Keep the original photographic face attached to the rotating geometry.
    // Its studio highlights are already baked in, so only modulate changes in light.
    vec4 photograph = texture2D(frontSurface, vec2(0.49 + p.x / 0.70 * 0.315, 0.49 - p.y / 0.96 * 0.45));
    // Blend across the curved shoulder, keeping the band equally wide near the tips.
    float ring = sqrt(max(1.0 - pow(p.y / 0.96, 2.0), 0.0064));
    float face = smoothstep(-0.10, 0.28, p.z / ring) * photograph.a;
    vec3 keyLight = normalize(vec3(-0.65, 0.8, 1.5));
    float referenceLight = 0.65 + 0.35 * max(dot(objectNormal, keyLight), 0.0);
    float movingLight = 0.65 + 0.35 * max(dot(normalize(rotation * objectNormal), keyLight), 0.0);
    color = mix(color, photograph.rgb * roastTint * movingLight / referenceLight, face);
    gl_FragColor = vec4(color, 1.0);
  }
`;

function beanPoint(latitude: number, longitude: number) {
  const y = Math.cos(latitude) * 0.96;
  const ring = Math.sin(latitude);
  const front = Math.cos(longitude);
  const x =
    0.69 * ring * Math.sin(longitude) * (1 + 0.055 * y) +
    0.025 * ring * ring * Math.sin(y * 3);
  const crease = 0.04 * Math.sin(y * 3.6) + 0.012 * Math.sin(y * 8) + 0.012;
  const width = 0.065 + 0.018 * (1 - y * y);
  // A coffee bean has a domed back and a flatter, cleft front, not two equal halves.
  let z = ring * front * (front > 0 ? 0.37 : 0.47);
  if (front > 0) {
    z -=
      0.14 *
      Math.exp(-(((x - crease) / width) ** 2)) *
      Math.sqrt(ring) *
      Math.min(1, front * 5);
  }
  const relief =
    0.004 * Math.sin(x * 31 + Math.sin(y * 17)) * Math.sin(y * 23 + front * 7) +
    0.003 * Math.sin(longitude * 13 + y * 19);
  z += relief * ring * ring * (0.3 + 0.7 * Math.max(0, front) ** 2);
  return [x, y, z];
}

export function beanMesh() {
  const latitudes = 112,
    longitudes = 192;
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

export function beanRotation(yaw: number, pitch: number, roll: number) {
  const cy = Math.cos(yaw),
    sy = Math.sin(yaw);
  const cx = Math.cos(pitch),
    sx = Math.sin(pitch);
  const cz = Math.cos(roll),
    sz = Math.sin(roll);
  // Column-major Rz * Rx * Ry, shared by the mesh and its material normals.
  return new Float32Array([
    cz * cy - sz * sx * sy,
    sz * cy + cz * sx * sy,
    -cx * sy,
    -sz * cx,
    cz * cx,
    sx,
    cz * sy + sz * sx * cy,
    sz * sy - cz * sx * cy,
    cx * cy,
  ]);
}

// Derive a continuous, mipmapped normal map once when the skin loads. Sobel
// gradients follow the photographed creases rather than a separate noise grid.
export function beanReliefPixels({ data, width, height }: ImageData) {
  const heights = new Float32Array(width * height);
  for (let i = 0; i < heights.length; i++) {
    heights[i] =
      (data[i * 4] * 0.299 +
        data[i * 4 + 1] * 0.587 +
        data[i * 4 + 2] * 0.114) /
      255;
  }
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const up = ((y + height - 1) % height) * width;
    const row = y * width;
    const down = ((y + 1) % height) * width;
    for (let x = 0; x < width; x++) {
      const left = (x + width - 1) % width;
      const right = (x + 1) % width;
      const dx =
        (heights[up + right] +
          2 * heights[row + right] +
          heights[down + right] -
          heights[up + left] -
          2 * heights[row + left] -
          heights[down + left]) *
        1.5;
      const dy =
        (heights[down + left] +
          2 * heights[down + x] +
          heights[down + right] -
          heights[up + left] -
          2 * heights[up + x] -
          heights[up + right]) *
        1.5;
      const length = Math.hypot(dx, dy, 1);
      const offset = (row + x) * 4;
      pixels[offset] = Math.round((0.5 - (dx / length) * 0.5) * 255);
      pixels[offset + 1] = Math.round((0.5 - (dy / length) * 0.5) * 255);
      pixels[offset + 2] = Math.round((0.5 + 0.5 / length) * 255);
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}
