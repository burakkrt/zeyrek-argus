---
kimlik: yetki
aciklama: Rol ve yetki testi (kim neyi görür, kim neyi yapabilir; tanım ile davranışın uyumu)
---
Kişinin görmemesi gerekeni görmediğini ve yapmaması gerekeni yapamadığını denetler.

Nasıl:
1. Tanımdan yetkiyi çıkar: sayfa ve düğme görünürlük koşulları, akışın ve uçların istediği izin, rol ve pozisyon.
2. İşlemi yetkili ve yetkisiz kullanıcıyla çalıştır (mikroservis çağrısında `asUserId` ile kullanıcı seçilebilir); yetkili
   kabul, yetkisiz anlaşılır iletiyle ret görmeli.
3. Ekranda yetkisiz kişiye gösterilen düğme, menü ya da bağlantı bulgudur (tıklayınca ret gelse bile).
4. Kendi kaydı üzerinde yapamaması gereken iş (kendi talebini onaylamak gibi) ayrıca denenir.
5. Tanımdaki izin adlarının birbiriyle tutarlı olduğuna bak (aynı iş için iki farklı izin istenmesi).
