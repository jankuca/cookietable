function CookieTable(/* name, [expires,] [creationCallback] */)
{
	this.name = arguments[0];
	this.expires = arguments.length == 3 || typeof arguments[1] == 'number' ? arguments[1] : 30; // days
	this.tableScheme = [];
	this.rows = [];
	this.sqlRegExps = {
		'SELECT': [
			/^\s*SELECT\s+(.+)\s+WHERE\s+(.+)\s*$/im,
			/^\s*SELECT\s+(.+)\s*$/im
		],
		'DELETE': [
			/^\s*DELETE(\s+)WHERE\s+(.+)\s*$/im,
			/^\s*DELETE(\s*)$/im
		],
		'UPDATE': [
			/^\s*UPDATE\s+SET\s+(.+)\s+WHERE\s+(.+)\s*$/im,
			/^\s*UPDATE\s+SET\s+(.+)\s*$/im
		],
		'INSERT': [
			/^\s*INSERT\s+\(([^)]+)\)\s+VALUES\s+\((.+)\)\s*$/im
		]
	};
	
	var cookie = decodeURIComponent($.cookie(this.name) || '');
	
	var rows = cookie.split('|||');
	for(var i = 0, len = rows.length; i < len; ++i)
	{
		var cols = rows[i].split('---');
		
		if(i == 0)
		{
			var scheme = cols;
			this.tableScheme = scheme;
			continue;
		}
		
		var row = {};
		for(var s = 0, sLen = scheme.length; s < sLen; ++s)
		{
			row[scheme[s]] = cols[s];
		}
		this.rows.push(row);
	}
		
	if(this.tableScheme.length == 1 && this.tableScheme[0] == '') // newly created table
	{
		if(arguments.length == 3) arguments[2].call(this,this);
		else if(typeof arguments[1] == 'function') arguments[1].call(this,this);
	}
}

CookieTable.prototype.query = function(SQL)
{
	var method = SQL.match(/^\s*(SELECT|UPDATE|DELETE|INSERT)\s+/im)[1].toUpperCase();
	var parsed = null;
	for(var i = 0, sqlRegExps = this.sqlRegExps[method], len = sqlRegExps.length; !parsed && i < len; ++i)
	{
		parsed = SQL.match(sqlRegExps[i]);
	}
	if(!parsed) return false;
	
	if(method != 'INSERT')
	{
		var whereRaw = parsed[2] ? parsed[2].split(/\s+AND\s+/im) : [];
		var where = [];
		for(var w = 0; w < whereRaw.length; ++w)
		{
			var cond = whereRaw[w].match(/^\s*(.*)\s*(\s+NOT\s+)?(=|==|!=|<|>|<=|>=|\s+IN\s+)\s*(.*)\s*$/im);
			if(!cond) return false;
			where.push(cond); // ex. ['user_id','NOT','IN','(1,2,3)'']
		}
	}
	
	if(method == 'SELECT')
	{
		var result = {
			rows: new CookieTableRows
		};
	}
	
	rowLoop: for(var i = 0, rows = this.rows, len = this.rows.length; i < len; ++i)
	{
		var row = rows[i];
		if(typeof row == 'undefined') continue;
		
		if(method != 'INSERT')
		{
			for(var w = 0; w < where.length; ++w)
			{
				var cond = where[w];
				cond[1] = cond[1].trim();
				cond[4] = cond[4].trim();
				
				switch(cond[3].toUpperCase())
				{
					case '=': case '==': case '!=': case '<': case '>': case '<=': case '>=':
						if(cond[3] == '=') cond[3] = '==';
						if(eval('row[\''+cond[1]+'\'] '+cond[3]+' '+cond[4]))
						{
							if(typeof cond[2] != 'undefined') continue rowLoop;
						}
						else if(typeof cond[2] == 'undefined') continue rowLoop;
						break;
					
					case 'IN':
						var list = cond[4].split(/\s*,\s*/m);
						if(typeof cond[2] == 'undefined')
						{
							for(var l = 0, lLen = list.length; l < lLen; ++l)
							{
								if(eval('row[\''+cond[2]+'\'] == '+cond[4])) continue rowLoop;
							}
						}
						else
						{
							for(var l = 0, lLen = list.length; l < lLen; ++l)
							{
								if(eval('row[\''+cond[2]+'\'] != '+cond[4])) continue rowLoop;
							}
						}
						break;
					
					default: return false;
				}
			}
		}
		
		switch(method)
		{
			case 'SELECT':
				var select = parsed[1] ? parsed[1].split(/\s*,\s*/m) : [];
				var item = {};
				for(var s = 0, sLen = select.length; s < sLen; ++s)
				{
					var value = row[select[s]];
					item[select[s]] = (value != 'null' ? value : null);
				}
				result.rows.add(item);
				break;
			
			case 'DELETE':
				delete this.rows[i];
				this._save();
				break;
		
			case 'UPDATE':
				var set = parsed[1] ? parsed[1].split(/\s*,\s*/m) : [];
				if(!set.length) return false;
				for(var s = 0, sLen = set.length; s < sLen; ++s)
				{
					var e = set[s].split(/\s*=\s*/m);
					this.rows[i][e[0]] = eval(e[1]);
				}
				this._save();
				break;
		}
	}
	
	if(method == 'INSERT')
	{
		var scheme = parsed[1] ? parsed[1].split(/\s*,\s*/m) : [];
		var valuesRaw = parsed[2];
		var values = [];
		var val = '', inValue = false;
		for(var o = 0, len = parsed[2].length; o < len; ++o)
		{
			var ch = valuesRaw[o];
			if(ch == '\'')
			{
				if(o == 0 || valuesRaw[o-1] != '\\') inValue = !inValue;
				else val += ch;
			}
			else if(ch == ',' && !inValue)
			{
				values.push(val);
				val = '';
			}
			else val += ch;
		}
		if(o) values.push(val);
		
		if(!scheme.length) return false;
		
		var item = {};
		var sLen = scheme.length;
		for(var v = 0, vLen = values.length; v < vLen; ++v)
		{
			if(v == sLen) break;
			
			item[scheme[v]] = values[v];
		}
		this.rows.push(item);
		this._save();
	}
	
	return result;
}

CookieTable.prototype._save = function()
{
	var scheme = this.tableScheme;
	
	var value = '';
	value += scheme.join('---');
	
	for(var i = 0, rows = this.rows, len = rows.length; i < len; ++i)
	{
		var row = rows[i];
		if(typeof row == 'undefined') continue;
		
		var cols = [];
		for(var s = 0, sLen = scheme.length; s < sLen; ++s)
		{
			cols.push(typeof row[scheme[s]] != 'undefined' ? row[scheme[s]] : '');
		}
		value += '|||' + cols.join('---');
	}
	
	$.cookie(this.name,encodeURIComponent(value),this.expires);
}

CookieTable.prototype.scheme = function()
{
	if(!arguments.length) return this.tableScheme;
	if(typeof arguments[0] == 'object' || typeof arguments[0] == 'array') this.tableScheme = arguments[0];
	else
	{
		var scheme = [];
		for(var i = 0; i < arguments.length; ++i) scheme.push(arguments[i]);
		this.tableScheme = scheme;
	}
	
	this._save();
}


function CookieTableRows()
{
	this._items = [];
	this.length = 0;
}
CookieTableRows.prototype.add = function(item)
{
	this._items.push(item);
	this.length = this._items.length;
}
CookieTableRows.prototype.remove = function(i)
{
	delete this._items[i];
	this.length = this._items.length;
}
CookieTableRows.prototype.item = function(i)
{
	return this._items[i] || null;
}

String.prototype.trim = function () {
    return this.replace(/^\s*/, "").replace(/\s*$/, "");
}
