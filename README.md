## Project overview

This project is a web-app for the Interaction Basics course of the bachelor's degree of Digital Interaction Design - Politecnico di Milano. The course is based around redesigning the product-system-interaction of a mid-complexity product (for the course of 2026 is a radio!). This app helps in sorting different design thinking cards (each one with random elements that changes the status quo of the research done by the students). The interface is based on trading cards unpacking, mainly just because is dope, but also because the idea is to make the students have fun.

Course by professors Mauro Cecconello, Paolo Perego
TA Federico Denni
Tutor Cecilia Ferrentino

Design and Coding of platform by Federico Denni
Cards effect based on Atropotos.js and Hover-tilt library by simeydotme
Tech-stack: HTML, CSS, Vanilla Js and Supabase (Postgres), Vercel
License MIT

---

### To use and copy this app

You'll need to setup a Supabase dataset (insert here details), then simply git clone this repository and npm install it. The cards design is a 350x600 image file (.webp) designed in Figma, you need to sort and insert them in `public/cards`. The type of cards listed are:

- Jobs-to-be-done (jobs): best setup these considering your product to be redesigned - for the Empathy Phase;
- Intended uses of object (use): what agency will the object have on the user? - for the Define Phase;
- Agency: these cards will prompt to reflect on a particular dimension of change for the object (material, spatial or norms and expectations) - for the Define phase to Ideate phase;
- Behavior: which behavior will be the interaction between user and object? - for the Ideate and Prototype Phase;
- Sensors and Actuators: these cards collect a list of common sensors and actuators to use with Arduino boards or similar to prototype the radios
- Brands: list of brands to help define the final product (after the testing phase)

If you are curios about the project and want to learn more, contact Federico Denni at: federico.denni@polimi.it or on his github account.

---

## 🇵🇸 Free Palestine 🇵🇸

---

##### To do

- [ ] html tags
  - [ ] fancy og tags for linkedin and socials
  - [ ] add and update meta tags
  - [ ] add aria-labels
- [ ] cards
  - [ ] add logic of shuffle to supabase table
  - [ ] add policies that admin can reshuffle singular cards
  - [ ] add graphics and connect graphics to display them on dashbaord and admin
- [ ] admin
  - [ ] add table to control groups (add/cut them, modify number of members and members)
  - [ ] add controls to shuffle cards
  - [ ] add access to a private dashboard to test and see (group 20)
- [ ] dashboard
- [ ] add text and informations (add name that user has chose)
- [ ] add

Ok! Risolto tutto. è arrivato il momento di lavorare sul database e su admin.html. Il piano è il seguente:

invece di avere le card randomizzate, queste verrano randomicamente scelte nella tabella group_cards del database. Questa tabella avrà nella colonna "assigned_cards" le card assegnate per gruppo (per il loro nome corrispondente al .webp, caricherò un file con tutti i nomi delle card).

Lo stato di "blocked" e "locked" sarà controllato dall'admin. Lo status base di ogni carta sarà "blocked". Nella Dashboard di admin.html saranno presenti degli checkbox radio che permetteranno di cambiare tra lo status blocked e locked. L'admin potrà selezionare i checkbox per rendere true o false lo stato. L'utente avrà poi la possibilità (selezionando il pacchetto che come è ora corrisponde a locked) di cambiare lo status ad unlocked.

Il tasto "R" permette adesso di passare da unlocked a locked, ma sarà un easter-egg nascosto utile solo per debug o per gli user per ripetere l'esperienza di spacchetto. La carta sarà sempre assegnata a livello di database. Cliccando sulla card unlocked invece, l'animazione della card sarà come il pacchetto: prima scende in basso, poi ricompare al centro in versione enlarged.

Per quanto riguarda l'admin.html. La grafica dell'admin HTML importa veramente poco. Ma ci devono essere dei punti fondamentali per aiutare l'admin a controllare tutto:

Innanzitutto un link alla propria pagina dashboard per aiutare a visionare e fare test delle varie card. Qui il funzionamento sarà esattamente come la normale pagina dashboard.

Ci sarà poi una tabella. Nella tabella saranno presenti: numero gruppo, studenti nel gruppo (nome) e email studente (variabili tra 4 e 5), e una colonna per ogni tipo di carta (jtbd, agency, behavior, sensor, actuator, brand) in queste colonne saranno presenti le carte assegnate (vanno bene anche solo i nomi per ora). Facciamo in modo che i checkbox radio saranno presenti nelle varie colonne in modo che si possano selezionare e bloccare tutti insieme.

La tabella deve essere modificabile in modo che gli admin possano:

Cambiare la card specifica assegnata per gruppo (facendo in modo di fare di nuovo una selezione randomica solo della carta di quella categoria)

fare una randomizzazione completa di tutte le carte per gruppo

Fare una randomizzazione completa di tutte le carte di tutti i gruppi

Aggiungere e o eliminare gruppi scegliendone i membri (e aggiungere o togliere studenti da un gruppo) - richiederà anche di inserire la mail

Fammi sapere se hai bisogno di dati dal database
