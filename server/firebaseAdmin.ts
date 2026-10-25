import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type DocumentReference } from 'firebase-admin/firestore';

const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
let familyRef: DocumentReference | undefined;

function getFamilyRef() {
  if (familyRef) return familyRef;
  if (!encoded) throw new Error('Configure FIREBASE_SERVICE_ACCOUNT_BASE64 para habilitar a sincronização compartilhada.');
  const serviceAccount = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  const firebaseApp = getApps()[0] ?? initializeApp({ credential: cert(serviceAccount) });
  familyRef = getFirestore(firebaseApp).collection('family').doc('shared');
  return familyRef;
}

const unavailableCollection = new Proxy({}, {
  get(_target, property) {
    if (property === 'collection') return () => unavailableCollection;
    return () => { throw new Error('Configure FIREBASE_SERVICE_ACCOUNT_BASE64 para habilitar a sincronização compartilhada.'); };
  },
});

export const family = new Proxy({} as DocumentReference, {
  get(_target, property) {
    if (!encoded && property === 'collection') return () => unavailableCollection;
    const target = getFamilyRef();
    const value = Reflect.get(target, property, target) as unknown;
    return typeof value === 'function' ? value.bind(target) : value;
  },
});
