const axios = require('axios');
const escpos = require('escpos');
escpos.Network = require('escpos-network');

const printers = {
    kitchen: { ip: "192.168.1.101", port: 9100 },
     
};


// API URLs
const GET_URL = "https://dineqrpro.com/VarsityKitchen/api/print_kotapi";
const UPDATE_URL = "https://dineqrpro.com/VarsityKitchen/api/insertkotprint";
const ITEM_API_BASE = "https://dineqrpro.com/VarsityKitchen/billing/kotapi/";

// SETTINGS
const WIDTH = 32; // 80mm printer width

let isPrinting = false;



// CATEGORY LOGIC
function getCategory(name) {
    name = name.toLowerCase();
    if (name.includes("beer") || name.includes("whisky") || name.includes("drink")) return "bar";
    if (name.includes("ice cream") || name.includes("dessert")) return "counter";
    return "kitchen";
}

// ALIGN LEFT-RIGHT
function formatLR(left, right, width = WIDTH) {
    left = left || '';
    right = right || '';
    const spaces = width - (left.length + right.length);
    return left + ' '.repeat(spaces > 0 ? spaces : 1) + right;
}

// PRINT ITEM (MULTI-LINE)
function printItem(printer, name, qty) {
    const qtyStr = qty.toString();
    const nameWidth = WIDTH - 6;

    const words = name.split(' ');
    let lines = [];
    let current = '';

    words.forEach(word => {
        if ((current + word).length <= nameWidth) {
            current += (current ? ' ' : '') + word;
        } else {
            lines.push(current);
            current = word;
        }
    });

    if (current) lines.push(current);

    lines.forEach((line, i) => {
        if (i === lines.length - 1) {
            const spaces = WIDTH - (line.length + qtyStr.length);
            printer.text(line + ' '.repeat(spaces) + qtyStr);
        } else {
            printer.text(line);
        }
    });
}

// PDF ITEM
function printItemPDF(doc, name, qty) {
    const qtyStr = qty.toString();
    const nameWidth = WIDTH - 6;

    const words = name.split(' ');
    let lines = [];
    let current = '';

    words.forEach(word => {
        if ((current + word).length <= nameWidth) {
            current += (current ? ' ' : '') + word;
        } else {
            lines.push(current);
            current = word;
        }
    });

    if (current) lines.push(current);

    lines.forEach((line, i) => {
        if (i === lines.length - 1) {
            const spaces = WIDTH - (line.length + qtyStr.length);
            doc.text(line + ' '.repeat(spaces) + qtyStr);
        } else {
            doc.text(line);
        }
    });
}

// PDF FALLBACK (PRO DESIGN)


// PRINT FUNCTION
function printToPrinter(type, order) {

    console.log(`🖨 Printing → ${type}`);

    // 🔴 CHECK PRINTER CONFIG
    if (!printers[type]) {
        console.log(`❌ No printer config for ${type}`);
        return;
    }

    let device;
    let printer;

    try {
        device = new escpos.Network(printers[type].ip, printers[type].port);
        printer = new escpos.Printer(device);
    } catch (err) {
        console.log("❌ Printer init failed:", err.message);
        return;
    }

    device.open((err) => {

        if (err) {
            console.log("❌ Cannot open printer:", err.message);
            return;
        }

        try {

            const line = '--------------------------------';

            printer.align('CT');
            printer.style('B');
            printer.text(`KOT - ORDER NO: ${order.order_no}`);
            printer.text(line);

            printer.align('LT');
            printer.style('NORMAL');

            printer.text(formatLR(`Waiter: ${order.waiter}`, `Table: ${order.table}`));
            printer.text(formatLR(`Date: ${order.date}`, `Time: ${order.time}`));

            printer.text(line);

            printer.style('B');
            printer.text(formatLR('Item', 'Qty'));
            printer.text(line);

            printer.style('NORMAL');

            let totalItem = 0;
            let totalQty = 0;

            order.items.forEach(item => {
                if (item.category === type) {
                    totalItem++;
                    totalQty += Number(item.qty);
                    printItem(printer, item.name, item.qty);
                }
            });

            printer.text(line);

            printer.style('B');
            printer.text(formatLR(`Total Item: ${totalItem}`, `Total Qty: ${totalQty}`));

            printer.text(line);

            printer.align('CT');
            printer.text('Special Instructions:-');
            printer.text(order.instructions || '-');

            printer.feed(2);
            printer.cut();
            printer.close();

            console.log("✅ Printed:", type);

        } catch (e) {
            console.log("❌ Print error:", e.message);
        }
    });
}

// MAIN AUTO PRINT
async function autoPrint() {

    if (isPrinting) return;
    isPrinting = true;

    try {

        const res = await axios.get(GET_URL);

        if (!res.data || res.data.status === false) {
            console.log("No orders");
            isPrinting = false;
            return;
        }

        const { order_id, session_id } = res.data;

        console.log("New Order:", order_id);

        const itemRes = await axios.get(ITEM_API_BASE + session_id);
        const itemData = itemRes.data;

        const order = {
            order_no: order_id,
            date: new Date().toLocaleDateString(),
            time: new Date().toLocaleTimeString(),
            waiter: itemData.waiter_name || "Staff",
            table: itemData.table_no || "-",
            instructions: itemData.orderidspecialinstruction?.order_spinstruction || "-",
            items: []
        };

        itemData.kotitems.forEach(item => {
            order.items.push({
                name: item.product_title,
                qty: item.order_items_qty,
                category: getCategory(item.product_title)
            });
        });

        console.log("Order Ready");

        ["kitchen"].forEach(type => {
            if (order.items.some(i => i.category === type)) {
                printToPrinter(type, order);
            }
        });

        await axios.post(UPDATE_URL, {
            order_id,
            print_status: 1
        });

        console.log("Status Updated");

    } catch (err) {
        console.log("Error:", err.message);
    }

    isPrinting = false;
}

// RUN LOOP
setInterval(autoPrint, 5000);
