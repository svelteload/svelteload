export const generateSlugFromName = (name: string): string => {
    const nordicCharMap: { [key: string]: string } = {
        'å': 'a', 'Å': 'A',
        'ä': 'a', 'Ä': 'A',
        'ö': 'o', 'Ö': 'O',
        'æ': 'ae', 'Æ': 'AE',
        'ø': 'o', 'Ø': 'O',
        'ü': 'u', 'Ü': 'U',
        'é': 'e', 'É': 'E',
        'è': 'e', 'È': 'E',
        'à': 'a', 'À': 'A',
        'ç': 'c', 'Ç': 'C',
    };

    let slug = name;
    Object.keys(nordicCharMap).forEach(char => {
        slug = slug.replaceAll(char, nordicCharMap[char]);
    });

    return slug
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .trim();
};