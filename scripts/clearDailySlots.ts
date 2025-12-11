import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, writeBatch, doc } from 'firebase/firestore';

// Firebase config (same as your app)
const firebaseConfig = {
    apiKey: "AIzaSyBnJpF5bqGYqQxGVBqvZqJqYqYqYqYqYqY",
    authDomain: "your-app.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-app.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function clearDailySlots() {
    console.log('🗑️  Iniciando limpieza de daily_slots...');

    const slotsRef = collection(db, 'daily_slots');
    const snapshot = await getDocs(slotsRef);

    if (snapshot.empty) {
        console.log('✅ No hay slots para eliminar');
        return;
    }

    console.log(`📊 Encontrados ${snapshot.size} slots`);

    // Firestore batch limit is 500
    const batches: any[] = [];
    let currentBatch = writeBatch(db);
    let operationCount = 0;

    snapshot.docs.forEach((docSnapshot) => {
        currentBatch.delete(doc(db, 'daily_slots', docSnapshot.id));
        operationCount++;

        if (operationCount === 500) {
            batches.push(currentBatch);
            currentBatch = writeBatch(db);
            operationCount = 0;
        }
    });

    // Add remaining batch
    if (operationCount > 0) {
        batches.push(currentBatch);
    }

    console.log(`🔄 Ejecutando ${batches.length} batch(es)...`);

    for (let i = 0; i < batches.length; i++) {
        await batches[i].commit();
        console.log(`   ✓ Batch ${i + 1}/${batches.length} completado`);
    }

    console.log('✅ Limpieza completada exitosamente');
}

clearDailySlots()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('❌ Error:', error);
        process.exit(1);
    });
