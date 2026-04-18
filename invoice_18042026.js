const axios = require('axios');
const escpos = require('escpos');
escpos.Network = require('escpos-network');

const GET_URL = "https://dineqrpro.com/VarsittyKitchen/api/print_kotapi";
const UPDATE_URL = "https://dineqrpro.com/VarsittyKitchen/api/insertkotprint";
const ITEM_API_BASE = "https://dineqrpro.com/VarsityKitchen/billing/kotapi/";

let isPrinting = false;

// PRINTER CONFIG
const printers = {
    kitchen: { ip: "192.168.1.101", port: 9100 }
};

// CATEGORY LOGIC
function getCategory(name) {
    name = name.toLowerCase();

    if (name.includes("beer") || name.includes("whisky") || name.includes("drink")) return "bar";
    if (name.includes("ice cream") || name.includes("dessert")) return "counter";

    return "kitchen";
}

// PRINT FUNCTION
function printToPrinter(type, order) {

    const device = new escpos.Network(printers[type].ip, printers[type].port);
    const printer = new escpos.Printer(device);

    const line = '--------------------------------';

    device.open(() => {

        // HEADER
        printer.align('CT');
        printer.style('B');
        printer.size(1, 1);
        printer.text(`KOT - ORDER NO: ${order.order_no}`);

        printer.text(line);

        // WAITER & TABLE
        printer.align('CT');
        printer.style('NORMAL');

        printer.text(
            formatLR(`Waiter: ${order.waiter || '-'}`, `Table: ${order.table || '-'}`)
        );

        printer.text(
            formatLR(`Date: ${order.date}`, `Time: ${order.time}`)
        );

        printer.text(line);

        // TABLE HEADER
        printer.style('B');
        printer.text(formatLR('Item', 'Qty'));
        printer.text(line);

        printer.style('NORMAL');

        let totalQty = 0;
        let totalItem = 0;

        order.items.forEach(item => {
            if (item.category === type) {

                totalItem++;
                totalQty += Number(item.qty);

                printer.text(
                    formatLR(item.name, item.qty.toString())
                );
            }
        });

        printer.text(line);

        // TOTALS
        printer.style('B');
        printer.text(
            formatLR(`Total Item: ${totalItem}`, `Total Qty: ${totalQty}`)
        );

        printer.text(line);

        // SPECIAL INSTRUCTIONS
        printer.align('CT');
        printer.text('Special Instructions:-');

        printer.align('LT');
        printer.style('NORMAL');
        printer.text(order.instructions || '-');

        printer.feed(2);
        printer.cut();
        printer.close();
    });
}
function formatLR(left, right, width = 32) {
    left = left || '';
    right = right || '';

    if (left.length + right.length > width) {
        left = left.substring(0, width - right.length - 1);
    }

    const spaces = width - (left.length + right.length);
    return left + ' '.repeat(spaces) + right;
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

        const order_id = res.data.order_id;
        const session_id = res.data.session_id;

        console.log("Order:", order_id);

        const itemRes = await axios.get(ITEM_API_BASE + session_id);

        const itemData = itemRes.data;
        const isCounter = !itemData.waiterandtable || itemData.waiterandtable === false
       const order = {
            order_no: order_id,
            date: new Date().toLocaleDateString(),
            time: new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
}),
            waiter: isCounter 
        ? "Counter" 
        : itemData.waiterandtable.fullname,

    table: isCounter 
        ? "Takeaway" 
        : itemData.waiterandtable.tables_number,

    instructions: itemData.orderidspecialinstruction?.order_spinstruction?.trim() || "-",
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

        console.log("Order Ready:", order);

     
      ["kitchen"].forEach(type => {
            if (order.items.some(i => i.category === type)) {
                printToPrinter(type, order);
            }
        });

       
        await axios.post(UPDATE_URL, {
            order_id: order_id,
            print_status: 1
        });

        console.log("Printed:", order_id);

    } catch (err) {
        console.log("Error:", err.message);
    }

    isPrinting = false;
}

// RUN EVERY 5 SEC
setInterval(autoPrint, 5000);
