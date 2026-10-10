// Small helpers for building map props out of plain shapes, in the toy look: toon shading and a dark outline.
import { BackSide, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, type BufferGeometry, type Object3D } from 'three';
import { colors } from '../../../shared/tokens';
import { toonMaterial } from '../../render/materials';

const inkShell = new MeshBasicMaterial({ color: colors.ink, side: BackSide });

/** A toon-shaded shape with an ink outline: a slightly bigger copy seen from the inside. */
export function toy(geometry: BufferGeometry, color: string, outline = 1.06): Mesh {
  const mesh = new Mesh(geometry, toonMaterial({ color }));
  mesh.castShadow = true;
  const shell = new Mesh(geometry, inkShell);
  shell.scale.setScalar(outline);
  mesh.add(shell);
  return mesh;
}

/** A slow sea of clouds far below, so a floor reads as high up. */
export function makeClouds(): Group {
  const group = new Group();
  const geometry = new IcosahedronGeometry(1, 1);
  const material = toonMaterial({ color: colors.cloud });
  for (let index = 0; index < 16; index++) {
    const cloud = new Mesh(geometry, material);
    const angle = (index / 16) * Math.PI * 2;
    const reach = 16 + (index % 4) * 6;
    cloud.position.set(Math.sin(angle) * reach * 1.2, -13 - (index % 3) * 2, Math.cos(angle) * reach - 4);
    cloud.scale.set(5 + (index % 3) * 2, 2.2, 4 + (index % 2) * 2);
    group.add(cloud);
  }
  return group;
}

/** Frees the geometry and materials of everything under an object. Shared ink shells are left alone. */
export function disposeToys(root: Object3D): void {
  root.traverse(node => {
    if (!(node instanceof Mesh)) return;
    node.geometry.dispose();
    if (node.material !== inkShell) (Array.isArray(node.material) ? node.material : [node.material]).forEach(material => material.dispose());
  });
}
