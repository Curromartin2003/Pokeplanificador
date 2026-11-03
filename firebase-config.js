// Configuración de Firebase: la misma que Pokecallejero (mismo proyecto, misma cuenta, mismas reglas).
// No es secreta: lo que protege los datos son las reglas de Firestore del repositorio de Pokecallejero, que ya
// permiten a cada usuario leer y escribir sus documentos de data/users/{uid}/ (aquí, data/users/{uid}/planificador).
// Si `firebase` es null, la app guarda los datos solo en este dispositivo (localStorage).
window.POKE_FB = {
  firebase: {
    apiKey: "AIzaSyBDQvJkE8-4YTVpGshw43qo1Hca6KwXNRk",
    authDomain: "pokecallejero.firebaseapp.com",
    projectId: "pokecallejero",
    storageBucket: "pokecallejero.firebasestorage.app",
    messagingSenderId: "922354229487",
    appId: "1:922354229487:web:a9c302ab02b3a9591c3b1a",
  },
};
