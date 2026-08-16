/* ═══════════════════════════════════════════════════════════════════
   freeglutenfree — configurazione
   ═══════════════════════════════════════════════════════════════════
   Qui vivono solo i due riferimenti al progetto Supabase, così si
   possono cambiare senza aprire index.html.

   La chiave qui sotto è la "publishable key": è progettata per stare
   in un file pubblico ed è innocua da sola, perché a proteggere i
   dati sono le policy Row Level Security installate con account.sql.
   La "secret key" invece non deve MAI finire in questo file.

   Se svuoti i due valori l'app continua a funzionare, semplicemente
   senza account: i posti salvati restano solo sul telefono.
   ═══════════════════════════════════════════════════════════════════ */

window.FGF_CONFIG = {
  supabaseUrl: "https://ovafetpgmumrtfsauxpy.supabase.co",
  supabaseKey: "sb_publishable_TXBt0fjaoYNp7iUphWYKxQ_9BGrJmgQ"
};
