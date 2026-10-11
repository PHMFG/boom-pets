// Small helpers for the few props still built from plain shapes in code (a fuse, a sign, a strip of light), in the
// toy look: toon shading and a dark outline. A map's scenery is modelled in Blender: see render/models.ts.
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
