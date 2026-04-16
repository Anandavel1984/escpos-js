const axios = require('axios');
const escpos = require('escpos');
escpos.USB = require('escpos-usb');

const PDFDocument = require('pdfkit');
const fs = require('fs');

// API URLs
const GET_URL = "https://dineqrpro.com/VarsityKitchen/api/print_kotapi";
const UPDATE_URL = "https://dineqrpro.com/VarsityKitchen/api/insertkotprint";
const ITEM_API_BASE = "https://dineqrpro.com/VarsityKitchen/billing/kotapi/";

// SETTINGS
const WIDTH = 32; // 80mm printer width

let isPrinting = false;

// PDF folder
const PDF_DIR = "./kot_backup/";
if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR);

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
function saveAsPDF(order, type) {

    const fileName = `${PDF_DIR}KOT_${order.order_no}_${type}.pdf`;

    const doc = new PDFDocument({
        size: [226, 800],
        margin: 14
    });

    doc.pipe(fs.createWriteStream(fileName));

    const line = '--------------------------------';

    doc.font('Courier-Bold').fontSize(14)
       .text(`KOT - ORDER NO: ${order.order_no}`, { align: 'center' });

    doc.moveDown(0.3);
    doc.fontSize(10).text(line);

    doc.font('Courier');
    doc.text(formatLR(`Waiter: ${order.waiter}`, `Table: ${order.table}`));
    doc.text(formatLR(`Date: ${order.date}`, `Time: ${order.time}`));

    doc.text(line);

    doc.font('Courier-Bold');
    doc.text(formatLR('Item', 'Qty'));

    doc.text(line);

    doc.font('Courier');

    let totalItem = 0;
    let totalQty = 0;

    order.items.forEach(item => {
        if (item.category === type) {
            totalItem++;
            totalQty += Number(item.qty);
            printItemPDF(doc, item.name, item.qty);
        }
    });

    doc.text(line);

    doc.font('Courier-Bold');
    doc.text(formatLR(`Total Item: ${totalItem}`, `Total Qty: ${totalQty}`));

    doc.text(line);

    doc.font('Courier-Bold')
       .text('Special Instructions:-', { align: 'center' });

    doc.font('Courier')
       .text(order.instructions || '-', { align: 'center' });

    doc.end();

    console.log("PDF Saved:", fileName);
}

// PRINT FUNCTION
function printToPrinter(type, order) {

    console.log(`🖨 Printing → ${type}`);

    let device, printer;

    try {
        device = new escpos.USB();
        printer = new escpos.Printer(device);
    } catch (err) {
        console.log("Printer not found → PDF fallback");
        saveAsPDF(order, type);
        return;
    }

    device.open((err) => {

        if (err) {
            console.log("Cannot open printer → PDF fallback");
            saveAsPDF(order, type);
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

            console.log("Printed:", type);

        } catch (e) {
            console.log("Print error → PDF fallback");
            saveAsPDF(order, type);
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
            console.log("⏳ No orders");
            isPrinting = false;
            return;
        }

        const { order_id, session_id } = res.data;

        console.log("📦 New Order:", order_id);

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

        ["kitchen", "bar", "counter"].forEach(type => {
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
