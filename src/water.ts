/// <reference path="../node_modules/@types/three/index.d.ts" />
/// <reference path="../node_modules/@types/dat-gui/index.d.ts" />


// Set up
const scene = new THREE.Scene()

const fov = 75
const aspect = window.innerWidth / window.innerHeight
const near = 0.1
const far = 2500
const camera = new THREE.PerspectiveCamera(fov, aspect, near, far)
camera.position.x = 300
camera.position.y = 100
camera.position.z = 400

const renderer = new THREE.WebGLRenderer()
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

const clock = new THREE.Clock()

const controls = new THREE.OrbitControls(camera, renderer.domElement)

class Wavefront {
  constructor(public amplitudeOverLength: number = 0,
              public length: number = 1,
              public steepness: number = 0.5,
              public speed: number = 1.0,
              public direction: THREE.Vector2 = degToVec2(0)) {}
}

const wavefronts = [
  new Wavefront(0.1, 10, 0, 0.3, degToVec2(0)),
  new Wavefront(0.1, 20, 0, 0.4, degToVec2(45)),
  new Wavefront(0.1, 15, 0, 0.2, degToVec2(13)),
  new Wavefront(0.074, 4, 0.87, -0.26, degToVec2(25)),
  new Wavefront(0.09, 9, 0.73, -0.55, degToVec2(17)),
  new Wavefront(0.15, 6, 0.77, -0.79, degToVec2(50)),
  new Wavefront(0.07, 8, 0.87, -0.16, degToVec2(53)),
  new Wavefront(0.08, 6, 0.97, -0.7, degToVec2(37)),
]


// Boat
const loader = new THREE.ObjectLoader()
loader.load('../assets/ship.json', obj => {
  const boat = obj
  scene.add(boat)
  boat.scale.x = boat.scale.y = boat.scale.z = 10
})

var directionalLight = new THREE.DirectionalLight()
scene.add(directionalLight)
directionalLight.position.z = -500
directionalLight.position.y = 300


// GUI
const gui = new dat.GUI()

wavefronts.forEach((wavefront, index) => {
  const GUIWavefront = {
    ...wavefront,
    direction: vec2ToDeg(wavefront.direction)
  }  

  const folder = gui.addFolder(`Wave ${index + 1}`)

  folder.add(GUIWavefront, 'amplitudeOverLength').min(0).max(0.5).step(0.1)
    .onChange((val: number) => { wavefront.amplitudeOverLength = val })

  folder.add(GUIWavefront, 'length').min(1)
    .onChange((val: number) => { wavefront.length = val })

  folder.add(GUIWavefront, 'steepness').min(0).max(1).step(0.01)
    .onChange((val: number) => { wavefront.steepness = val })

  folder.add(GUIWavefront, 'speed').step(0.1)
    .onChange((val: number) => { wavefront.speed = val })

  folder.add(GUIWavefront, 'direction').min(0).max(359)
    .onChange((val: number) => { wavefront.direction = degToVec2(val) })
})

function degToVec2(degree: number): THREE.Vector2 {
  return new THREE.Vector2(Math.cos(THREE.Math.degToRad(degree)),
                           Math.sin(THREE.Math.degToRad(degree)))
}

function vec2ToDeg(vec: THREE.Vector2): number {
  return THREE.Math.radToDeg(Math.atan2(vec.y, vec.x))
}


// Surface
const uniforms = {
  time: {type: 'f', value: 1.0},
  wavefronts: { value: wavefronts }
}
const size = 256
const surface = new THREE.Mesh(
  new THREE.PlaneBufferGeometry(30, 30, size, size),
  new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      #define M_PI 3.1415926535897932384626433832795
      #define NUM_WAVEFRONTS 8
      #define NUM_LF_WAVEFRONTS 3
      #define NUM_HF_WAVEFRONTS 5

      uniform float time;

      varying vec3 surfaceNormal;
      varying vec3 vertPos;

      struct Wave {
        vec3 position;
        vec3 normal;
      };

      struct Wavefront {
        float amplitudeOverLength;
        float length;
        float steepness;
        float speed;
        vec2 direction;
      };
      uniform Wavefront wavefronts[NUM_WAVEFRONTS];

      Wave getWave(Wavefront wf, vec3 basePosition) {
        float A = wf.amplitudeOverLength * wf.length;
        float L = wf.length;
        float w = 2.0 * M_PI / L; // frequency
        float Q = A == 0.0 ? wf.steepness : wf.steepness / (w * A);
        vec2 D = wf.direction;
        float speed = wf.speed;   // phase

        float dotD = dot(basePosition, vec3(D.x, 0.0, D.y));
        float S = sin(w * dotD + time * speed);
        float C = cos(w * dotD + time * speed);

        vec3 wavePosition = vec3(basePosition.x + Q * A * C * D.x,
                                 A * S,
                                 basePosition.z + Q * A * C * D.y);

        vec3 waveNormal = vec3(-D.x * w * A * C,            
                               1.0 - Q * w * A * S,
                               -D.y * w * A * C);

        return Wave(wavePosition, waveNormal);
      }

      Wave sumWaves() {
        Wave lowFrequencySum = Wave(vec3(0.0), vec3(0.0));
        Wave highFrequencySum = Wave(vec3(0.0), vec3(0.0));

        for (int i = 0; i < NUM_LF_WAVEFRONTS; i++) {
          Wave wave = getWave(wavefronts[i], position);
          lowFrequencySum.position += wave.position;
          lowFrequencySum.normal += wave.normal;
        }

        for (int i = NUM_LF_WAVEFRONTS; i < NUM_WAVEFRONTS; i++) {
          Wave wave = getWave(wavefronts[i], lowFrequencySum.position);
          highFrequencySum.position += wave.position;
          highFrequencySum.normal += wave.normal;
        }

        return Wave(lowFrequencySum.position + highFrequencySum.position,
                    lowFrequencySum.normal + highFrequencySum.normal);
      }

      void main(){
        Wave combinedWave = sumWaves();
        gl_Position = projectionMatrix * modelViewMatrix
                      * vec4(combinedWave.position, 1.0);
        vertPos = vec3(modelMatrix * vec4(combinedWave.position, 1.0));
        surfaceNormal = vec3(modelMatrix * vec4(combinedWave.normal, 1.0));
      }
    `,
    fragmentShader: `
      varying vec3 surfaceNormal;
      varying vec3 vertPos;

      const vec3 lightPos = vec3(0.0, 300.0, -500.0);
      const vec3 diffuseColor = vec3(0.05, 0.3, 0.6);
      const vec3 ambientColor = vec3(0.04, 0.0, 0.0);
      const vec3 specularColor = vec3(1.0, 0.66, 0.33) * 3.0;

      void main() {
        vec3 normal = normalize(surfaceNormal); 
        vec3 lightDir = normalize(lightPos - vertPos);

        float lambertian = max(dot(lightDir, normal), 0.0);
        float specular = 0.0;

        if (lambertian > 0.0) {
          vec3 halfwayDir = reflect(-lightDir, normal);
          vec3 viewDir = normalize(cameraPosition - vertPos);

          float specAngle = max(dot(halfwayDir, viewDir), 0.0);
          specular = pow(specAngle, 32.0);
        }

        gl_FragColor = vec4(lambertian * diffuseColor
                            + ambientColor
                            + specular * specularColor, 1.0);
      }
    `
  }))
scene.add(surface)
surface.geometry.rotateX(-90 * THREE.Math.DEG2RAD)


// Loop
function main() {
  requestAnimationFrame(main)
  uniforms.time.value = clock.getElapsedTime()
  renderer.render(scene, camera)
}
main()
