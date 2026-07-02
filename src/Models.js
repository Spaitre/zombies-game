import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Rotación base para que el FRENTE del modelo Kenney apunte hacia +Z (la
 * dirección de avance/apuntado del juego). Antes estaba en PI y los personajes
 * quedaban de espaldas.
 */
export const MODEL_FACE_OFFSET = 0;

/**
 * Carga y cachea modelos .glb (Kenney) con GLTFLoader. Las instancias se
 * obtienen con get(): clona el grafo y CLONA los materiales para que tintar
 * uno (p. ej. el flash de daño) no afecte a los demás del mismo tipo.
 */
export default class Models {
  constructor() {
    this.loader = new GLTFLoader();
    this.cache = new Map();
  }

  load(key, url) {
    return new Promise((resolve, reject) => {
      this.loader.load(url, (gltf) => {
        const root = gltf.scene;
        root.traverse((o) => {
          if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
        });
        // Guardamos también los clips de animación del .glb (walk, sprint, idle,
        // die...) que vienen con los personajes Kenney; antes se descartaban.
        this.cache.set(key, { scene: root, animations: gltf.animations || [] });
        resolve(root);
      }, undefined, reject);
    });
  }

  loadAll(entries) {
    return Promise.all(entries.map(([k, u]) => this.load(k, u)));
  }

  /** Devuelve una instancia clonada (con materiales propios). */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    // clone(true) preserva los nombres de los nodos (leg-left, arm-right...),
    // que es lo que el AnimationMixer usa para enlazar los clips (no hay skins).
    const clone = entry.scene.clone(true);
    const mats = [];
    clone.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material = o.material.clone();
        mats.push(o.material);
      }
    });
    clone.userData.mats = mats;
    // Los clips son plantillas inmutables: se comparten entre todas las instancias.
    clone.userData.animations = entry.animations;
    return clone;
  }

  /** Caja de contorno (Box3) del modelo original, para medir tamaño. */
  bbox(key) {
    const entry = this.cache.get(key);
    return entry ? new THREE.Box3().setFromObject(entry.scene) : null;
  }

  /** Tamaño {x,y,z} del modelo. */
  size(key) {
    const b = this.bbox(key);
    if (!b) return null;
    const v = new THREE.Vector3();
    b.getSize(v);
    return v;
  }
}
