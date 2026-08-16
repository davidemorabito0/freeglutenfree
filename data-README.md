# Dati

Questa cartella è generata automaticamente da `scripts/raccolta.py`,
eseguito dal workflow **Raccolta dati OpenStreetMap** ogni tre ore.
Non modificarla a mano: viene riscritta a ogni giro.

## Fonte e licenza

Tutti i dati provengono da **OpenStreetMap** e sono distribuiti con
licenza **Open Database License (ODbL) 1.0**.

> © OpenStreetMap contributors — https://www.openstreetmap.org/copyright

Chi riusa questi file deve mantenere l'attribuzione e rilasciare eventuali
database derivati con la stessa licenza.

Nessun altro archivio viene interrogato dalla raccolta. I database delle
piattaforme italiane dedicate alla celiachia sono protetti dal diritto sui
generis del costitutore (art. 102-bis L. 633/1941), che vieta l'estrazione
sistematica dei contenuti **anche se riscritti con parole diverse**: per
questo non compaiono qui e non compariranno finché non ci sarà un accordo.

## Struttura

```
data/
  _province.json     elenco delle province italiane con bounding box
  _stato.json        punto di ripresa della raccolta
  _indice.json       conteggi per provincia, letto dall'app
  mangiare/<SG>.json locali con indicazioni senza glutine
  spesa/<SG>.json    farmacie, parafarmacie, bio, supermercati
```

`<SG>` è la sigla della provincia (MI, RM, ME…).

## Come funziona il giro

Un passaggio completo sull'Italia richiede diverse ore, quindi il lavoro è
spezzato: ogni esecuzione elabora una manciata di province e salva dove è
arrivata. Al termine dell'ultimo lotto il contatore riparte da capo e i
dati si aggiornano ciclicamente.

Per forzare un giro completo da zero: **Actions → Raccolta dati
OpenStreetMap → Run workflow**, con `riparti_da_zero` impostato a `si`.

## Campi

I record sono abbreviati per tenere i file leggeri.

| Campo | Significato |
|---|---|
| `k` | chiave univoca |
| `ty` `id` | tipo e identificativo OSM (`n` nodo, `w` way, `r` relation) |
| `n` | nome |
| `la` `ln` | latitudine e longitudine |
| `lv` | livello di sicurezza (solo `mangiare`) |
| `ct` | categoria (solo `spesa`) |
| `or` | da cosa è stato riconosciuto: tag, cucina, descrizione, nome |
| `gf` | valore grezzo del tag `diet:gluten_free` |

**Nota sul livello.** Solo `diet:gluten_free=only` viene promosso a
`gf_100`. Il valore `yes` indica soltanto che esistono opzioni senza
glutine e non dice nulla su come è gestita la contaminazione incrociata:
resta perciò in `dati_insufficienti`. È una scelta deliberata — in questo
ambito un falso positivo è un danno alla salute.
