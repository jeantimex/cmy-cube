# CMY Cube

An interactive 3D visualization of a CMY (Cyan, Magenta, Yellow) cube built with Three.js and custom GLSL shaders. The cube simulates the optical properties of transparent acrylic with subtractive color mixing, internal reflections, caustic shadows, and ground reflections.

https://github.com/user-attachments/assets/b75e20e6-61dd-436f-912e-9fe8a13e77c8

## Subtractive Color Model

The CMY cube uses **subtractive color mixing**, the same principle used in printing. Each pair of opposing faces is assigned one of the three subtractive primary colors:

- **X-axis faces**: Yellow
- **Y-axis faces**: Magenta  
- **Z-axis faces**: Cyan

When light passes through multiple faces, the colors combine subtractively:
- Cyan + Magenta = Blue
- Cyan + Yellow = Green
- Magenta + Yellow = Red
- Cyan + Magenta + Yellow = Black (all light absorbed)

## Cube Shader Implementation

The cube uses a custom `ShaderMaterial` with ray-tracing techniques to simulate realistic transparent acrylic behavior.

### Ray-Box Intersection

The shader calculates where view rays enter and exit the cube using AABB (Axis-Aligned Bounding Box) intersection:

```glsl
vec2 intersectBox(vec3 rayOrigin, vec3 rayDir, vec3 boxHalfSize) {
  vec3 invDir = 1.0 / rayDir;
  vec3 t1 = (-boxHalfSize - rayOrigin) * invDir;
  vec3 t2 = (boxHalfSize - rayOrigin) * invDir;
  vec3 tMin = min(t1, t2);
  vec3 tMax = max(t1, t2);
  float tNear = max(max(tMin.x, tMin.y), tMin.z);
  float tFar = min(min(tMax.x, tMax.y), tMax.z);
  return vec2(tNear, tFar);
}
```

### Refraction and Dispersion

Light bends when entering and exiting the cube based on the Index of Refraction (IOR). The shader also simulates **chromatic dispersion** by using slightly different IOR values for red, green, and blue channels:

```glsl
float iorR = safeIor - dispersion;  // Red bends less
float iorG = safeIor;                // Green at base IOR
float iorB = safeIor + dispersion;   // Blue bends more
```

### Internal Reflection

When light hits a face from inside at a steep angle, it undergoes **total internal reflection** instead of exiting. The shader traces up to 12 bounces:

```glsl
vec3 exitRayDir = refract(currentRayDir, -hitNormal, ior);
if (length(exitRayDir) > 0.1) {
  // Light exits the cube
  break;
} else {
  // Total internal reflection
  currentRayDir = reflect(currentRayDir, -hitNormal);
}
```

Each bounce accumulates the face color, creating the rich color mixing visible when looking through multiple faces.

### Face Color Detection

The shader determines which face was hit by examining the surface normal:

```glsl
vec3 getFaceColor(vec3 normal) {
  vec3 absNormal = abs(normal);
  if (absNormal.x > 0.5) return YELLOW;
  if (absNormal.y > 0.5) return MAGENTA;
  return CYAN;
}
```

### Visual Effects

- **Fresnel**: Increased reflectivity at grazing angles
- **Specular highlights**: Sharp light reflections on surfaces
- **Edge detection**: Subtle highlighting of internal edges where faces meet
- **Fake environment reflections**: Procedural sky/ground for surface reflections

## Caustic Shadow System

The ground plane uses a modified `MeshPhongMaterial` with injected GLSL code to render colored caustic shadows.

### Shadow Ray Tracing

For each ground pixel, the shader traces a ray toward the light source through the cube:

```glsl
ShadowResult traceDualLayerShadow(vec3 rayOrigin, vec3 rayDir, vec3 boxHalfSize, ...) {
  // Sample multiple rays in a disk pattern for soft shadows
  for (int i = 0; i < SAMPLES; i++) {
    vec2 disk = diskSample(i, SAMPLES, rotation);
    vec3 sampleDir = normalize(rayDir + offset * spread);
    // Trace through cube, accumulating filter colors
  }
}
```

### Dual-Layer Shadows

The shadow system uses two layers for realistic soft shadows:

1. **Inner layer (sharp)**: Small light size, shows detailed color caustics from single-face passes
2. **Outer layer (soft)**: Larger light size, shows blended colors from multi-face passes

The layers are blended based on occlusion to create shadows that are sharp near the cube and soft at the edges.

> **Note**: There is ongoing work to implement physically accurate shadows through improved lighting simulation, which would eliminate the need for this dual-layer approach and produce realistic caustics directly from the light source properties.

### Color Filtering

As shadow rays pass through the cube, they accumulate color based on which faces they traverse:

```glsl
vec3 traceShadow(vec3 rayOrigin, vec3 rayDir, ...) {
  // Entry face color
  filterColor *= getFaceColor(entryNormal);
  
  // Internal bounces
  for (int i = 0; i < 4; i++) {
    filterColor *= getFaceColor(hitNormal);
    // Refract or reflect based on angle
  }
  return filterColor;
}
```

## Ground Reflection

A second cube mesh is rendered below the ground plane (y = -1) to create a mirror reflection effect.

### Reflection Setup

```javascript
reflectionCube.scale.y = -1;      // Flip vertically
reflectionCube.position.y = -2;   // Position below ground
reflectionCube.renderOrder = -1;  // Render before ground
```

### Fade Effect

The reflection fades out based on distance from the ground plane:

```glsl
float distFromGround = abs(vWorldPosition.y + 1.0);
float fadeOut = 1.0 - smoothstep(0.0, reflectionFade, distFromGround);
```

### Shadow on Reflection

The reflection shader also traces shadows from the main cube to darken areas where the cube's shadow falls:

```glsl
vec3 groundPos = vec3(vWorldPosition.x, -0.99, vWorldPosition.z);
float shadow = calcShadow(groundPos, lightDirection, mainCubeInverseMatrix, cubeSize * 0.5);
vec3 shadowedColor = color * (1.0 - shadow * shadowOpacity);
```

## Lighting

The scene uses two light sources that work together:

### Hemisphere Light (Ambient)

Provides soft, omnidirectional ambient illumination with different colors for sky and ground.

### Directional Light (Main)

The primary light source that determines:
- **Shadow direction**: Caustic shadows project opposite to the light direction
- **Specular highlights**: Bright spots where light reflects directly to camera
- **Color temperature**: Adjustable from cool (blue) to warm (orange)

The light position is controlled via spherical coordinates (azimuth, elevation, distance), and intensity automatically adjusts with distance to simulate natural falloff.

## Coordinate Spaces

The shaders work in local cube space for accurate ray tracing. World-to-local transformation is handled via the inverse model matrix:

```glsl
vec3 localPos = (inverseModelMatrix * vec4(worldPos, 1.0)).xyz;
vec3 localLightDir = normalize((inverseModelMatrix * vec4(lightDirection, 0.0)).xyz);
```

This allows the cube to be rotated while maintaining correct refraction and shadow calculations.

## Performance

The rendering is GPU-intensive due to real-time ray tracing in the fragment shaders:

- **Cube shader**: Traces up to 12 internal reflection bounces per pixel
- **Ground shader**: Samples 48 rays per pixel for soft shadow calculation
- **Reflection shader**: Additional ray tracing for the mirrored cube with shadow overlay

Performance depends on screen resolution and GPU capability. On integrated graphics, consider reducing the browser window size. The pixel ratio is capped at 2x to balance quality and performance on high-DPI displays.

## License

MIT
