// Small helpers for building map props out of plain shapes, in the toy look: toon shading and a dark outline.
import { BackSide, Mesh, MeshBasicMaterial, type BufferGeometry, type Object3D } from 'three';
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

/** Frees the geometry and materials of everything under an object. Shared ink shells are left alone. */
export function disposeToys(root: Object3D): void {
  root.traverse(node => {
    if (!(node instanceof Mesh)) return;
    node.geometry.dispose();
    if (node.material !== inkShell) (Array.isArray(node.material) ? node.material : [node.material]).forEach(material => material.dispose());
  });
}
