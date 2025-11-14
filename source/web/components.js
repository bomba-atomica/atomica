/**
 * Reusable Alpine.js component templates
 */

// Tab button component
window.tabButton = (name, label) => ({
    ['@click']() { this.activeTab = name; },
    [':class']() {
        return this.activeTab === name
            ? 'border-blue-500 text-blue-600'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300';
    },
    class: 'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm cursor-pointer',
    get text() { return label; }
});

// Asset selector dropdown component
window.assetSelector = (model) => ({
    ['x-model']: model,
    class: 'w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 border'
});

// Currency display component
window.currencyDisplay = (amount, label, colorClass = 'text-gray-900') => ({
    get displayAmount() {
        return this.formatCurrency(amount) + ' USDC';
    },
    label,
    colorClass
});

// Submit button component
window.submitButton = (text, onClick, variant = 'primary') => {
    const variants = {
        primary: 'bg-blue-600 hover:bg-blue-700',
        success: 'bg-green-600 hover:bg-green-700',
        danger: 'bg-red-600 hover:bg-red-700',
        secondary: 'bg-gray-600 hover:bg-gray-700'
    };

    return {
        ['@click']: onClick,
        class: `${variants[variant]} text-white px-6 py-2 rounded-md font-medium`,
        get text() { return text; }
    };
};

// Number input component
window.numberInput = (model, placeholder, step = '0.01') => ({
    type: 'number',
    ['x-model.number']: model,
    placeholder,
    step,
    min: '0',
    class: 'w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 border'
});

// Info card component
window.infoCard = (title, color = 'blue') => {
    const colors = {
        blue: 'bg-blue-50 border-blue-200',
        green: 'bg-green-50 border-green-200',
        orange: 'bg-orange-50 border-orange-200',
        purple: 'bg-purple-50 border-purple-200',
        gray: 'bg-gray-50 border-gray-200'
    };

    return {
        class: `${colors[color]} border rounded-lg p-4 space-y-2`,
        title
    };
};
