// Firebase konsolundan (Project settings → Your apps → Web app) aldığın məlumatları bura yapışdır.
// Bu açarlar gizli deyil — Firebase web üçün belə nəzərdə tutub. Təhlükəsizliyi firestore.rules təmin edir.
window.CHAT_CONFIG = {
  firebase: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  },
  // Otağın adı. Linki bilməyən tapmasın deyə qəribə bir ad qoy (məs: "elnur-x7k29q").
  room: "bizim-otaq"
};
