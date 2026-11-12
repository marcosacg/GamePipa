// Mundo físico (Ammo.js / Bullet) e atalhos
import * as THREE from 'three';

export const UP = new THREE.Vector3(0, 1, 0);

export const PH = {
  A: null, world: null, dispatcher: null,
  TV: null, TQ: null, ZERO: null,
  tags: new Map(),   // ponteiro do corpo -> etiqueta {type, label, ref}
};

export function initPhysics(A) {
  PH.A = A;
  const cfg = new A.btDefaultCollisionConfiguration();
  PH.dispatcher = new A.btCollisionDispatcher(cfg);
  const broad = new A.btDbvtBroadphase();
  const solver = new A.btSequentialImpulseConstraintSolver();
  PH.world = new A.btDiscreteDynamicsWorld(PH.dispatcher, broad, solver, cfg);
  PH.world.setGravity(new A.btVector3(0, -9.81, 0));
  PH.TV = new A.btVector3(0, 0, 0);
  PH.TQ = new A.btQuaternion(0, 0, 0, 1);
  PH.ZERO = new A.btVector3(0, 0, 0);
}

export function makeBody(shape, mass, pos, quat, group, mask, tag) {
  const A = PH.A;
  const tr = new A.btTransform(); tr.setIdentity();
  tr.setOrigin(new A.btVector3(pos.x, pos.y, pos.z));
  if (quat) tr.setRotation(new A.btQuaternion(quat.x, quat.y, quat.z, quat.w));
  const ms = new A.btDefaultMotionState(tr);
  const inertia = new A.btVector3(0, 0, 0);
  if (mass > 0) shape.calculateLocalInertia(mass, inertia);
  const info = new A.btRigidBodyConstructionInfo(mass, ms, shape, inertia);
  const body = new A.btRigidBody(info);
  PH.world.addRigidBody(body, group, mask);
  if (tag) PH.tags.set(A.getPointer(body), tag);
  body._ms = ms;
  return body;
}

export function removeBody(b) {
  const A = PH.A;
  PH.tags.delete(A.getPointer(b));
  PH.world.removeRigidBody(b);
  A.destroy(b);
  if (b._ms) A.destroy(b._ms);
}

export function staticBox(hx, hy, hz, pos, tag, rotY = 0, group = 2) {
  const A = PH.A;
  const q = new THREE.Quaternion().setFromAxisAngle(UP, rotY);
  return makeBody(new A.btBoxShape(new A.btVector3(hx, hy, hz)), 0, pos, q, group, -1, tag);
}

export function getPos(b, out) { const o = b.getWorldTransform().getOrigin(); return out.set(o.x(), o.y(), o.z()); }
export function getVel(b, out) { const v = b.getLinearVelocity(); return out.set(v.x(), v.y(), v.z()); }
export function setPos(b, p) {
  const tr = b.getWorldTransform();
  PH.TV.setValue(p.x, p.y, p.z); tr.setOrigin(PH.TV);
  b.getMotionState().setWorldTransform(tr);
}
export function setVel(b, v) { PH.TV.setValue(v.x, v.y, v.z); b.setLinearVelocity(PH.TV); }
export function force(b, f) { PH.TV.setValue(f.x, f.y, f.z); b.applyCentralForce(PH.TV); }
export function setRot(b, q) { PH.TQ.setValue(q.x, q.y, q.z, q.w); b.getWorldTransform().setRotation(PH.TQ); }

/** percorre os contatos e chama cb(tagA, tagB) para cada par encostado */
export function forEachContact(cb) {
  const A = PH.A, d = PH.dispatcher;
  const n = d.getNumManifolds();
  for (let i = 0; i < n; i++) {
    const m = d.getManifoldByIndexInternal(i);
    const nc = m.getNumContacts();
    if (!nc) continue;
    let hit = false;
    for (let j = 0; j < nc; j++) if (m.getContactPoint(j).getDistance() < .03) { hit = true; break; }
    if (!hit) continue;
    const a = PH.tags.get(A.getPointer(m.getBody0())), b = PH.tags.get(A.getPointer(m.getBody1()));
    if (a && b) cb(a, b);
  }
}
