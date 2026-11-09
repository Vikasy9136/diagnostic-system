# System Architecture & Specimen Lifecycle

## 1. High-Level Specimen Chain-of-Custody

```
+--------------------+        +---------------------+        +--------------------+
|   Small Lab /      |        |     Phlebotomist    |        |   Large Partner    |
| Collection Center  | -----> |  (Field Logistics)  | -----> |  Reference Lab     |
+--------------------+        +---------------------+        +--------------------+
         |                               |                              |
  1. Order & Barcode              2. Scan & Cold-Pack            3. Accessioning & Test
  2. Pickup Request               3. GPS Transit Updates         4. Report Upload
         |                               |                              |
         +-------------------------------+------------------------------+
                                         |
                                         v
                            +--------------------------+
                            | Admin Command Dashboard  |
                            | Real-time Audit & Alerts |
                            +--------------------------+
```

## 2. Sample Status Lifecycle (State Machine)

1. `ORDER_CREATED`: Order placed by Small Lab.
2. `READY_FOR_PICKUP`: Specimen collected and packed into transport container.
3. `DISPATCHED_TO_PHLEBO`: Admin/system assigns phlebotomist.
4. `PICKED_UP`: Phlebotomist scans barcode at Small Lab location, verifies specimen temperature, signs digital custody transfer.
5. `IN_TRANSIT`: Specimen is actively moving to the testing facility under temperature tracking.
6. `DELIVERED_TO_LAB`: Specimen arrives at Large Partner Lab; laboratory technician scans and accepts custody.
7. `UNDER_ANALYSIS`: Specimen in analytical testing queue.
8. `REPORT_UPLOADED`: Diagnostic result PDF/structured data uploaded to Firebase Storage.
9. `COMPLETED`: Small lab and patient notified.
10. `REJECTED`: Quality check failed (hemolysis, temperature excursion, leakage).

## 3. Cold-Chain Requirements

Specimens fall into 3 strict temperature categories:
* **Ambient (Room Temp):** 15°C to 25°C
* **Refrigerated (Cold-Pack):** 2°C to 8°C
* **Frozen (Dry Ice):** -20°C or below
